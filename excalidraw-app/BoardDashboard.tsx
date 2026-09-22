import { useCallback, useEffect, useMemo, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from "react";
import "./board-dashboard.css";
import { BoardThumbnail } from "./BoardThumbnail";

type Board = BoardStorageItem;
type Folder = BoardStorageFolder;

type BoardDashboardProps = {
  onOpenBoard: (boardId: string) => void;
  onOpenExternalFile: (file: { id: string; name: string }) => Promise<void>;
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;
const WINDOWS_RESERVED_NAMES = new Set(["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"]);

const validateName = (name: string, existingNames: string[], label: string) => {
  const trimmed = name.trim();
  if (!trimmed) return `Enter a ${label.toLowerCase()}.`;
  if (trimmed.length > 100) return `${label}s can be at most 100 characters.`;
  if (INVALID_FILENAME_CHARS.test(trimmed)) return 'The name cannot contain: < > : " / \\ | ? *';
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) return "The name cannot end with a space or a period.";
  if (WINDOWS_RESERVED_NAMES.has(trimmed.split(".")[0].toUpperCase())) return `"${trimmed}" is not a valid Windows filename.`;
  if (existingNames.some((name) => name.toLowerCase() === trimmed.toLowerCase())) return `A ${label.toLowerCase()} with this name already exists here.`;
  return null;
};

export const BoardDashboard = ({ onOpenBoard, onOpenExternalFile }: BoardDashboardProps) => {
  const [currentFolder, setCurrentFolder] = useState("");
  const [boards, setBoards] = useState<Board[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [allFolders, setAllFolders] = useState<Folder[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [folderCreateError, setFolderCreateError] = useState<string | null>(null);

  const [renamingBoard, setRenamingBoard] = useState<Board | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);
  const [duplicatingBoardId, setDuplicatingBoardId] = useState<string | null>(null);
  const [movingBoard, setMovingBoard] = useState<Board | null>(null);
  const [movingBoardBusy, setMovingBoardBusy] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; board: Board } | null>(null);

  const [boardsFolder, setBoardsFolder] = useState<string | null>(null);
  const [changingFolder, setChangingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentBoards, setRecentBoards] = useState<RecentBoardItem[]>([]);
  const [missingRecentBoard, setMissingRecentBoard] = useState<RecentBoardItem | null>(null);

  const [boardSearch, setBoardSearch] = useState("");
  const [boardSort, setBoardSort] = useState<"updated" | "name-asc" | "name-desc">("updated");
  const [favoriteBoardIds, setFavoriteBoardIds] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem("excalidraw-custom-favorites");
      const parsed = stored ? JSON.parse(stored) : [];
      return Array.isArray(parsed) ? new Set(parsed) : new Set();
    } catch { return new Set(); }
  });
  const [boardView, setBoardView] = useState<"grid" | "list">(() => {
    try { return localStorage.getItem("excalidraw-custom-board-view") === "list" ? "list" : "grid"; }
    catch { return "grid"; }
  });

  const refreshRecent = useCallback(async () => {
    setRecentBoards(await window.boardStorage.getRecent());
  }, []);

  const refreshFolder = useCallback(async (folderPath = currentFolder) => {
    try {
      const [listing, recentList] = await Promise.all([
        window.boardStorage.list(folderPath),
        window.boardStorage.getRecent(),
      ]);
      setBoards(listing.boards);
      setFolders(listing.folders);
      setRecentBoards(recentList);
      setDashboardError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load boards.";
      setDashboardError(message);
      if (folderPath) {
        const parts = folderPath.split("/").filter(Boolean);
        parts.pop();
        const parent = parts.join("/");
        setCurrentFolder(parent);
      }
    }
  }, [currentFolder]);

  const refreshAllFolders = useCallback(async () => {
    try { setAllFolders(await window.boardStorage.listFolders()); } catch {}
  }, []);

  useEffect(() => {
    void refreshFolder(currentFolder);
    void refreshAllFolders();
    void window.boardStorage.getFolder().then(setBoardsFolder).catch((error) => setFolderError(error instanceof Error ? error.message : "Failed to load the boards folder."));
    if (!window.boardStorage.onChange) return;
    return window.boardStorage.onChange(() => {
      void refreshFolder(currentFolder);
      void refreshAllFolders();
    });
  }, [currentFolder, refreshFolder, refreshAllFolders]);

  useEffect(() => {
    const onFocus = () => {
      void refreshFolder(currentFolder);
      void refreshAllFolders();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [currentFolder, refreshFolder, refreshAllFolders]);

  const changeBoardView = (view: "grid" | "list") => {
    setBoardView(view);
    localStorage.setItem("excalidraw-custom-board-view", view);
  };

  const toggleFavorite = (boardId: string) => {
    setFavoriteBoardIds((current) => {
      const next = new Set(current);
      if (next.has(boardId)) next.delete(boardId); else next.add(boardId);
      localStorage.setItem("excalidraw-custom-favorites", JSON.stringify([...next]));
      return next;
    });
  };

  const openCreateDialog = () => { setNewBoardName(""); setCreateError(null); setCreatingBoard(true); };
  const createBoard = async () => {
    const error = validateName(newBoardName, boards.map((b) => b.name), "Board name");
    if (error) { setCreateError(error); return; }
    try {
      const board = await window.boardStorage.create(newBoardName.trim(), currentFolder);
      setCreatingBoard(false);
      await refreshFolder(currentFolder);
      onOpenBoard(board.id);
    } catch (error) { setCreateError(error instanceof Error ? error.message : "Failed to create board."); }
  };

  const createFolder = async () => {
    const error = validateName(newFolderName, folders.map((f) => f.name), "Folder name");
    if (error) { setFolderCreateError(error); return; }
    try {
      await window.boardStorage.createFolder(currentFolder, newFolderName.trim());
      setCreatingFolder(false);
      setNewFolderName("");
      await refreshFolder(currentFolder);
      await refreshAllFolders();
    } catch (error) { setFolderCreateError(error instanceof Error ? error.message : "Failed to create folder."); }
  };

  const openRenameDialog = (board: Board) => { setRenamingBoard(board); setRenameValue(board.name); setRenameError(null); };
  const renameBoard = async () => {
    if (!renamingBoard) return;
    const error = validateName(renameValue, boards.filter((b) => b.id !== renamingBoard.id).map((b) => b.name), "Board name");
    if (error) { setRenameError(error); return; }
    try {
      await window.boardStorage.rename(renamingBoard.id, renameValue.trim());
      setRenamingBoard(null);
      await refreshFolder(currentFolder);
    } catch (error) { setRenameError(error instanceof Error ? error.message : "Failed to rename board."); }
  };

  const duplicateBoard = async (board: Board) => {
    try {
      setDuplicatingBoardId(board.id);
      const duplicate = await window.boardStorage.duplicate(board.id);
      await refreshFolder(currentFolder);
      onOpenBoard(duplicate.id);
    } catch (error) { setDashboardError(error instanceof Error ? error.message : "Failed to duplicate board."); }
    finally { setDuplicatingBoardId(null); }
  };

  const deleteBoard = async () => {
    if (!deletingBoard) return;
    try { await window.boardStorage.delete(deletingBoard.id); setDeletingBoard(null); await refreshFolder(currentFolder); }
    catch (error) { setDashboardError(error instanceof Error ? error.message : "Failed to delete board."); }
  };

  const moveBoard = async (board: Board, destination: string) => {
    if (board.folderPath === destination) { setMovingBoard(null); return; }
    try {
      setMovingBoardBusy(true);
      await window.boardStorage.move(board.id, destination);
      setMovingBoard(null);
      await refreshFolder(currentFolder);
      await refreshAllFolders();
      await refreshRecent();
    } catch (error) { setDashboardError(error instanceof Error ? error.message : "Failed to move board."); }
    finally { setMovingBoardBusy(false); }
  };

  const openExternalFile = async () => {
    try { const file = await window.boardStorage.openExternal(); if (file) await onOpenExternalFile(file); }
    catch (error) { setDashboardError(error instanceof Error ? error.message : "Failed to open Excalidraw file."); }
  };

  const openRecentBoard = async (recent: RecentBoardItem) => {
    if (!recent.exists) { setMissingRecentBoard(recent); return; }
    try {
      const opened = await window.boardStorage.openRecent(recent.id, recent.path, recent.kind);
      if (opened.kind === "managed") onOpenBoard(opened.id); else await onOpenExternalFile(opened);
    } catch (error) { setDashboardError(error instanceof Error ? error.message : "Failed to open recent file."); await refreshRecent(); }
  };

  const removeMissingRecentBoard = async () => {
    if (!missingRecentBoard) return;
    await window.boardStorage.removeRecent(missingRecentBoard.path);
    setMissingRecentBoard(null);
    await refreshRecent();
  };

  const changeBoardsFolder = async () => {
    try {
      setFolderError(null);
      const selectedFolder = await window.boardStorage.chooseFolder();
      if (!selectedFolder) return;
      setChangingFolder(true);
      const folder = await window.boardStorage.setFolder(selectedFolder);
      setBoardsFolder(folder);
      setCurrentFolder("");
      await refreshFolder("");
      await refreshAllFolders();
    } catch (error) { setFolderError(error instanceof Error ? error.message : "Failed to change the boards folder."); }
    finally { setChangingFolder(false); }
  };

  const enterFolder = (folder: Folder) => { setBoardSearch(""); setCurrentFolder(folder.relativePath); };
  const goBack = () => {
    if (!currentFolder) return;
    const parts = currentFolder.split("/").filter(Boolean);
    parts.pop();
    setBoardSearch("");
    setCurrentFolder(parts.join("/"));
  };

  const breadcrumbs = currentFolder.split("/").filter(Boolean);
  const normalizedSearch = boardSearch.trim().toLowerCase();
  const filteredBoards = useMemo(() => [...boards].filter((board) => !normalizedSearch || board.name.toLowerCase().includes(normalizedSearch)).sort((a,b) => {
    const af = favoriteBoardIds.has(a.id), bf = favoriteBoardIds.has(b.id);
    if (af !== bf) return af ? -1 : 1;
    if (boardSort === "name-asc") return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
    if (boardSort === "name-desc") return b.name.localeCompare(a.name, undefined, { numeric: true, sensitivity: "base" });
    return b.mtimeMs - a.mtimeMs;
  }), [boards, normalizedSearch, boardSort, favoriteBoardIds]);

  const handleDropOnFolder = async (event: DragEvent, folder: Folder) => {
    event.preventDefault();
    setDragOverFolder(null);
    const id = event.dataTransfer.getData("application/x-excalidraw-board-id");
    const board = boards.find((item) => item.id === id);
    if (board) await moveBoard(board, folder.relativePath);
  };

  useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    document.addEventListener("click", closeMenu);
    document.addEventListener("contextmenu", closeMenu);
    return () => {
      document.removeEventListener("click", closeMenu);
      document.removeEventListener("contextmenu", closeMenu);
    };
  }, [contextMenu]);

  const showBoardContextMenu = (event: ReactMouseEvent, board: Board) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 210;
    const menuHeight = 255;
    setContextMenu({
      x: Math.max(8, Math.min(event.clientX, window.innerWidth - menuWidth - 8)),
      y: Math.max(8, Math.min(event.clientY, window.innerHeight - menuHeight - 8)),
      board,
    });
  };

  return (
    <div className="board-dashboard">
      <div className="board-dashboard__container">
        <header className="board-dashboard__header">
          <div>
            <h1>{currentFolder ? breadcrumbs[breadcrumbs.length - 1] : "My Boards"}</h1>
            <p>{currentFolder ? "Boards in this folder" : "Your Excalidraw boards"}</p>
          </div>
          <div className="board-dashboard__header-actions">
            <button className="board-dashboard__settings-button" onClick={() => { setFolderError(null); setSettingsOpen(true); }} aria-label="Open settings" title="Settings">⚙</button>
            <button className="board-dashboard__secondary-button" onClick={() => void openExternalFile()}>Open File</button>
            <button className="board-dashboard__secondary-button" onClick={() => { setNewFolderName(""); setFolderCreateError(null); setCreatingFolder(true); }}>+ New Folder</button>
            <button className="board-dashboard__primary-button" onClick={openCreateDialog}>+ New Board</button>
          </div>
        </header>

        {currentFolder && (
          <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "18px", flexWrap: "wrap" }}>
            <button type="button" onClick={() => { setCurrentFolder(""); setBoardSearch(""); }} style={{ border: 0, background: "transparent", padding: "4px 6px", cursor: "pointer", color: "inherit", fontWeight: 600 }}>My Boards</button>
            {breadcrumbs.map((crumb, index) => (
              <span key={`${crumb}-${index}`} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ opacity: 0.45 }}>/</span>
                <button type="button" onClick={() => { setCurrentFolder(breadcrumbs.slice(0,index+1).join("/")); setBoardSearch(""); }} style={{ border: 0, background: "transparent", padding: "4px 6px", cursor: "pointer", color: "inherit", fontWeight: index === breadcrumbs.length - 1 ? 700 : 500 }}>{crumb}</button>
              </span>
            ))}
            <button type="button" onClick={goBack} style={{ marginLeft: "auto", border: "1px solid var(--default-border-color, #d9d9d9)", borderRadius: "8px", background: "var(--island-bg-color, #fff)", padding: "7px 11px", cursor: "pointer" }}>← Back</button>
          </div>
        )}

        {dashboardError && <p className="dialog__error">{dashboardError}</p>}

        {recentBoards.length > 0 && !currentFolder && (
          <section className="board-dashboard__recent">
            <div className="board-dashboard__section-header"><div><h2>Recent</h2><p>Files you opened recently</p></div></div>
            <div className="board-dashboard__recent-list">
              {recentBoards.map((recent) => (
                <button key={`${recent.id}-${recent.path}`} className={`board-dashboard__recent-item${recent.exists ? "" : " board-dashboard__recent-item--missing"}`} onClick={() => void openRecentBoard(recent)}>
                  <span className="board-dashboard__recent-icon">✎</span>
                  <span className="board-dashboard__recent-info"><span className="board-dashboard__recent-name">{recent.name}</span><span className="board-dashboard__recent-path">{recent.exists ? recent.path : "File not found"}</span></span>
                  <span className="board-dashboard__recent-time">{new Date(recent.lastOpenedAt).toLocaleDateString()}</span>
                </button>
              ))}
            </div>
          </section>
        )}

        <div className="board-dashboard__board-controls" style={{ display: "flex", gap: "10px", alignItems: "center", marginBottom: "18px", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: "1 1 280px", minWidth: 0 }}>
            <input aria-label="Search boards" value={boardSearch} onChange={(event) => setBoardSearch(event.target.value)} placeholder="Search boards..." style={{ width: "100%", boxSizing: "border-box", padding: "10px 38px 10px 12px", border: "1px solid var(--default-border-color, #d9d9d9)", borderRadius: "8px", background: "var(--island-bg-color, #fff)", color: "var(--text-primary-color, #1b1b1f)", fontSize: "14px", outline: "none" }} />
            {boardSearch && <button type="button" onClick={() => setBoardSearch("")} aria-label="Clear board search" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", width: "24px", height: "24px", padding: 0, border: 0, borderRadius: "50%", background: "transparent", cursor: "pointer", fontSize: "18px" }}>×</button>}
          </div>
          <select aria-label="Sort boards" value={boardSort} onChange={(event) => setBoardSort(event.target.value as typeof boardSort)} style={{ flex: "0 0 auto", minWidth: "160px", padding: "10px 32px 10px 12px", border: "1px solid var(--default-border-color, #d9d9d9)", borderRadius: "8px", background: "var(--island-bg-color, #fff)", color: "var(--text-primary-color, #1b1b1f)", fontSize: "14px", cursor: "pointer" }}>
            <option value="updated">Last modified</option><option value="name-asc">Name A → Z</option><option value="name-desc">Name Z → A</option>
          </select>
          <div role="group" aria-label="Board view" style={{ display: "flex", border: "1px solid var(--default-border-color, #d9d9d9)", borderRadius: "8px", overflow: "hidden", flex: "0 0 auto" }}>
            <button type="button" onClick={() => changeBoardView("grid")} aria-label="Grid view" aria-pressed={boardView === "grid"} style={{ width: "40px", height: "38px", padding: 0, border: 0, borderRight: "1px solid var(--default-border-color, #d9d9d9)", background: boardView === "grid" ? "var(--button-gray-2, #e9e9e9)" : "var(--island-bg-color, #fff)", cursor: "pointer" }}>▦</button>
            <button type="button" onClick={() => changeBoardView("list")} aria-label="List view" aria-pressed={boardView === "list"} style={{ width: "40px", height: "38px", padding: 0, border: 0, background: boardView === "list" ? "var(--button-gray-2, #e9e9e9)" : "var(--island-bg-color, #fff)", cursor: "pointer" }}>☰</button>
          </div>
        </div>

        <div className="board-dashboard__boards-heading"><h2>{currentFolder ? "Boards" : "My Boards"}<span style={{ marginLeft: "8px", fontSize: "13px", fontWeight: 400, opacity: 0.65 }}>{boards.length}{favoriteBoardIds.size > 0 ? ` · ★ ${favoriteBoardIds.size}` : ""}</span></h2></div>

        {folders.length > 0 && !normalizedSearch && (
          <div style={{ display: "grid", gridTemplateColumns: boardView === "list" ? "1fr" : "repeat(auto-fill, minmax(220px, 1fr))", gap: "14px", marginBottom: boards.length ? "24px" : 0 }}>
            {folders.map((folder) => (
              <button key={folder.relativePath} type="button" onClick={() => enterFolder(folder)} onDragOver={(event) => { event.preventDefault(); setDragOverFolder(folder.relativePath); }} onDragLeave={() => setDragOverFolder(null)} onDrop={(event) => void handleDropOnFolder(event, folder)} style={{ minHeight: boardView === "list" ? "72px" : "110px", textAlign: "left", border: `1px solid ${dragOverFolder === folder.relativePath ? "var(--color-primary, #6965db)" : "var(--default-border-color, #d9d9d9)"}`, borderRadius: "12px", background: dragOverFolder === folder.relativePath ? "rgba(105,101,219,.08)" : "var(--island-bg-color, #fff)", cursor: "pointer", padding: "16px", display: "flex", alignItems: "center", gap: "12px", fontSize: "15px" }}>
                <span style={{ fontSize: "32px" }}>📁</span><span style={{ minWidth: 0, flex: 1 }}><strong style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{folder.name}</strong><span style={{ opacity: 0.6, fontSize: "12px" }}>Open folder</span></span><span style={{ opacity: 0.45 }}>›</span>
              </button>
            ))}
          </div>
        )}

        {boards.length === 0 ? (
          <div className="board-dashboard__empty"><div className="board-dashboard__empty-icon">{folders.length ? "📁" : "✎"}</div><h2>{folders.length ? "No boards in this folder" : "No boards yet"}</h2><p>{folders.length ? "Open a folder or create a board here." : "Create your first board to get started."}</p><button className="board-dashboard__primary-button" onClick={openCreateDialog}>Create Board</button></div>
        ) : filteredBoards.length === 0 ? (
          <div className="board-dashboard__empty"><div className="board-dashboard__empty-icon">⌕</div><h2>No matching boards</h2><p>Try a different search.</p><button className="board-dashboard__primary-button" onClick={() => setBoardSearch("")}>Clear Search</button></div>
        ) : (
          <div className="board-grid" style={boardView === "list" ? { display: "flex", flexDirection: "column", gap: "12px" } : undefined}>
            {filteredBoards.map((board) => (
              <article key={board.id} className="board-card" draggable onContextMenu={(event) => showBoardContextMenu(event, board)} onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("application/x-excalidraw-board-id", board.id); }} style={boardView === "list" ? { position: "relative", display: "flex", alignItems: "stretch", minHeight: "132px" } : { position: "relative" }}>
                <button type="button" onClick={() => toggleFavorite(board.id)} aria-label={favoriteBoardIds.has(board.id) ? `Remove ${board.name} from favorites` : `Add ${board.name} to favorites`} title={favoriteBoardIds.has(board.id) ? "Remove from favorites" : "Add to favorites"} style={{ position: "absolute", top: "10px", right: "10px", zIndex: 2, width: "32px", height: "32px", padding: 0, border: "none", borderRadius: "8px", background: "rgba(255,255,255,.92)", color: favoriteBoardIds.has(board.id) ? "#f5b301" : "#777", cursor: "pointer", fontSize: "18px", lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 1px 4px rgba(0,0,0,.12)" }}>{favoriteBoardIds.has(board.id) ? "★" : "☆"}</button>
                <button className="board-card__preview-button" onClick={() => onOpenBoard(board.id)} aria-label={`Open ${board.name}`} style={boardView === "list" ? { flex: "0 0 220px", width: "220px", minHeight: "132px" } : undefined}><BoardThumbnail boardId={board.id} /></button>
                <div className="board-card__content" style={boardView === "list" ? { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" } : undefined}>
                  <button className="board-card__name" onClick={() => onOpenBoard(board.id)}>{board.name}</button>
                  <p className="board-card__date">{new Date(board.updatedAt).toLocaleString()}</p>
                  <div className="board-card__actions">
                    <button type="button" className="board-card__more-button" style={{ flex: "0 0 34px", width: "34px", height: "32px", padding: 0, fontSize: "20px", lineHeight: 1 }} onClick={(event) => showBoardContextMenu(event, board)} aria-label={`Actions for ${board.name}`} title="Board actions">⋮</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {contextMenu && (
        <div role="menu" aria-label={`${contextMenu.board.name} actions`} style={{ position: "fixed", left: contextMenu.x, top: contextMenu.y, zIndex: 2000, width: "210px", boxSizing: "border-box", padding: "6px", overflow: "hidden", border: "1px solid #dedee2", borderRadius: "10px", background: "#fff", boxShadow: "0 12px 32px rgba(0,0,0,.16)" }} onClick={(event) => event.stopPropagation()}>
          <div style={{ overflow: "hidden", padding: "8px 10px 9px", color: "#888", fontSize: "11px", fontWeight: 600, textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{contextMenu.board.name}</div>
          <button type="button" role="menuitem" style={{ display: "block", width: "100%", boxSizing: "border-box", border: 0, borderRadius: "7px", padding: "9px 10px", background: "transparent", color: "#2d2d30", font: "inherit", fontSize: "13px", textAlign: "left", cursor: "pointer" }} onClick={() => { onOpenBoard(contextMenu.board.id); setContextMenu(null); }}>Open</button>
          <button type="button" role="menuitem" style={{ display: "block", width: "100%", boxSizing: "border-box", border: 0, borderRadius: "7px", padding: "9px 10px", background: "transparent", color: "#2d2d30", font: "inherit", fontSize: "13px", textAlign: "left", cursor: "pointer" }} disabled={duplicatingBoardId === contextMenu.board.id} onClick={() => { const board = contextMenu.board; setContextMenu(null); void duplicateBoard(board); }}>{duplicatingBoardId === contextMenu.board.id ? "Duplicating…" : "Duplicate"}</button>
          <button type="button" role="menuitem" style={{ display: "block", width: "100%", boxSizing: "border-box", border: 0, borderRadius: "7px", padding: "9px 10px", background: "transparent", color: "#2d2d30", font: "inherit", fontSize: "13px", textAlign: "left", cursor: "pointer" }} onClick={() => { const board = contextMenu.board; setContextMenu(null); openRenameDialog(board); }}>Rename</button>
          <button type="button" role="menuitem" style={{ display: "block", width: "100%", boxSizing: "border-box", border: 0, borderRadius: "7px", padding: "9px 10px", background: "transparent", color: "#2d2d30", font: "inherit", fontSize: "13px", textAlign: "left", cursor: "pointer" }} onClick={() => { const board = contextMenu.board; setContextMenu(null); setMovingBoard(board); }}>Move to…</button>
          <div style={{ height: "1px", margin: "5px 4px", background: "#ededee" }} />
          <button type="button" role="menuitem" style={{ display: "block", width: "100%", boxSizing: "border-box", border: 0, borderRadius: "7px", padding: "9px 10px", background: "transparent", color: "#d64545", font: "inherit", fontSize: "13px", textAlign: "left", cursor: "pointer" }} onClick={() => { const board = contextMenu.board; setContextMenu(null); setDeletingBoard(board); }}>Delete</button>
        </div>
      )}

      {settingsOpen && <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}><div className="dialog board-settings-dialog"><div className="board-settings-dialog__header"><div><h2>Settings</h2><p>Configure where your Excalidraw boards are stored.</p></div><button className="board-settings-dialog__close" onClick={() => setSettingsOpen(false)} aria-label="Close settings">×</button></div><section className="board-settings-section"><div className="board-settings-section__title"><h3>Storage</h3><p>Boards are saved as standard .excalidraw files.</p></div><div className="board-settings-folder"><div className="board-settings-folder__path"><span className="board-settings-folder__label">Boards folder</span><span className="board-settings-folder__value">{boardsFolder || "Loading..."}</span></div><button className="board-settings-folder__change" onClick={() => void changeBoardsFolder()} disabled={changingFolder}>{changingFolder ? "Changing..." : "Change…"}</button></div>{folderError && <p className="dialog__error">{folderError}</p>}</section></div></div>}

      {creatingBoard && <div className="dialog-backdrop"><div className="dialog"><h2>Create New Board</h2><label>Board name<input autoFocus value={newBoardName} onChange={(event) => { setNewBoardName(event.target.value); setCreateError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void createBoard(); if (event.key === "Escape") setCreatingBoard(false); }} placeholder="e.g. Project Ideas" /></label>{createError && <p className="dialog__error">{createError}</p>}<div className="dialog__actions"><button onClick={() => setCreatingBoard(false)}>Cancel</button><button className="dialog__primary" onClick={() => void createBoard()}>Create</button></div></div></div>}

      {creatingFolder && <div className="dialog-backdrop"><div className="dialog"><h2>New Folder</h2><label>Folder name<input autoFocus value={newFolderName} onChange={(event) => { setNewFolderName(event.target.value); setFolderCreateError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void createFolder(); if (event.key === "Escape") setCreatingFolder(false); }} placeholder="e.g. School" /></label>{folderCreateError && <p className="dialog__error">{folderCreateError}</p>}<div className="dialog__actions"><button onClick={() => setCreatingFolder(false)}>Cancel</button><button className="dialog__primary" onClick={() => void createFolder()}>Create</button></div></div></div>}

      {renamingBoard && <div className="dialog-backdrop"><div className="dialog"><h2>Rename Board</h2><label>Board name<input autoFocus value={renameValue} onChange={(event) => { setRenameValue(event.target.value); setRenameError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void renameBoard(); if (event.key === "Escape") setRenamingBoard(null); }} /></label>{renameError && <p className="dialog__error">{renameError}</p>}<div className="dialog__actions"><button onClick={() => setRenamingBoard(null)}>Cancel</button><button className="dialog__primary" onClick={() => void renameBoard()}>Rename</button></div></div></div>}

      {deletingBoard && <div className="dialog-backdrop"><div className="dialog"><h2>Delete Board</h2><p className="dialog__message">Are you sure you want to delete <strong>{deletingBoard.name}</strong>?</p><div className="dialog__actions"><button onClick={() => setDeletingBoard(null)}>Cancel</button><button className="dialog__danger" onClick={() => void deleteBoard()}>Delete</button></div></div></div>}

      {movingBoard && <div className="dialog-backdrop"><div className="dialog"><h2>Move Board</h2><p className="dialog__message">Choose the destination folder for <strong>{movingBoard.name}</strong>.</p><div style={{ maxHeight: "320px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "6px", marginTop: "14px" }}>{allFolders.map((folder) => <button key={folder.relativePath} type="button" disabled={movingBoardBusy || movingBoard.folderPath === folder.relativePath} onClick={() => void moveBoard(movingBoard, folder.relativePath)} style={{ textAlign: "left", padding: "10px 12px", border: "1px solid var(--default-border-color, #d9d9d9)", borderRadius: "8px", background: movingBoard.folderPath === folder.relativePath ? "var(--button-gray-2, #e9e9e9)" : "var(--island-bg-color, #fff)", cursor: movingBoard.folderPath === folder.relativePath ? "default" : "pointer" }}>📁 {folder.relativePath || "My Boards"}</button>)}</div><div className="dialog__actions"><button onClick={() => setMovingBoard(null)} disabled={movingBoardBusy}>Cancel</button></div></div></div>}

      {missingRecentBoard && <div className="dialog-backdrop"><div className="dialog"><h2>File not found</h2><p className="dialog__message">This file is no longer available at its original location.</p><div className="board-dashboard__missing-path">{missingRecentBoard.path}</div><div className="dialog__actions"><button onClick={() => setMissingRecentBoard(null)}>Cancel</button><button className="dialog__danger" onClick={() => void removeMissingRecentBoard()}>Remove from Recent</button></div></div></div>}
    </div>
  );
};
