import { useCallback, useEffect, useState } from "react";
import "./board-dashboard.css";
import { BoardThumbnail } from "./BoardThumbnail";

type Board = BoardStorageItem;

type BoardDashboardProps = {
  onOpenBoard: (boardId: string) => void;
  onOpenExternalFile: (file: {
    id: string;
    name: string;
  }) => Promise<void>;
};

const INVALID_FILENAME_CHARS = /[<>:"/\\|?*\x00-\x1F]/;

const WINDOWS_RESERVED_NAMES = new Set([
  "CON",
  "PRN",
  "AUX",
  "NUL",
  "COM1",
  "COM2",
  "COM3",
  "COM4",
  "COM5",
  "COM6",
  "COM7",
  "COM8",
  "COM9",
  "LPT1",
  "LPT2",
  "LPT3",
  "LPT4",
  "LPT5",
  "LPT6",
  "LPT7",
  "LPT8",
  "LPT9",
]);

const validateBoardName = (
  name: string,
  boards: Board[],
  currentBoardId?: string,
) => {
  const trimmed = name.trim();

  if (!trimmed) {
    return "Enter a board name.";
  }

  if (trimmed.length > 100) {
    return "Board names can be at most 100 characters.";
  }

  if (INVALID_FILENAME_CHARS.test(trimmed)) {
    return 'The name cannot contain: < > : " / \\ | ? *';
  }

  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    return "The name cannot end with a space or a period.";
  }

  if (WINDOWS_RESERVED_NAMES.has(trimmed.split(".")[0].toUpperCase())) {
    return `"${trimmed}" is not a valid Windows filename.`;
  }

  const alreadyExists = boards.some(
    (board) =>
      board.id !== currentBoardId &&
      board.name.toLowerCase() === trimmed.toLowerCase(),
  );

  if (alreadyExists) {
    return "A board with this name already exists.";
  }

  return null;
};

export const BoardDashboard = ({
  onOpenBoard,
  onOpenExternalFile,
}: BoardDashboardProps) => {
  const [boards, setBoards] = useState<Board[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  const [renamingBoard, setRenamingBoard] = useState<Board | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const [boardsFolder, setBoardsFolder] = useState<string | null>(null);
  const [changingFolder, setChangingFolder] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [recentBoards, setRecentBoards] = useState<RecentBoardItem[]>([]);
  const [missingRecentBoard, setMissingRecentBoard] =
    useState<RecentBoardItem | null>(null);

  const refreshBoards = useCallback(async () => {
    try {
      const [boardList, recentList] = await Promise.all([
        window.boardStorage.list(),
        window.boardStorage.getRecent(),
      ]);

      setBoards(boardList);
      setRecentBoards(recentList);
      setDashboardError(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : "Failed to load boards.",
      );
    }
  }, []);

  useEffect(() => {
    void refreshBoards();

    void window.boardStorage
      .getFolder()
      .then(setBoardsFolder)
      .catch((error) => {
        setFolderError(
          error instanceof Error
            ? error.message
            : "Failed to load the boards folder.",
        );
      });

    if (!window.boardStorage.onChange) {
      return;
    }

    return window.boardStorage.onChange(() => {
      void refreshBoards();
    });
  }, [refreshBoards]);

  const openCreateDialog = () => {
    setNewBoardName("");
    setCreateError(null);
    setCreatingBoard(true);
  };

  const createBoard = async () => {
    const error = validateBoardName(newBoardName, boards);

    if (error) {
      setCreateError(error);
      return;
    }

    try {
      setCreateError(null);

      const board = await window.boardStorage.create(newBoardName.trim());

      setNewBoardName("");
      setCreatingBoard(false);

      await refreshBoards();
      onOpenBoard(board.id);
    } catch (error) {
      setCreateError(
        error instanceof Error ? error.message : "Failed to create board.",
      );
    }
  };

  const openRenameDialog = (board: Board) => {
    setRenamingBoard(board);
    setRenameValue(board.name);
    setRenameError(null);
  };

  const renameBoard = async () => {
    if (!renamingBoard) {
      return;
    }

    const error = validateBoardName(renameValue, boards, renamingBoard.id);

    if (error) {
      setRenameError(error);
      return;
    }

    try {
      await window.boardStorage.rename(renamingBoard.id, renameValue.trim());
      await refreshBoards();

      setRenamingBoard(null);
      setRenameValue("");
      setRenameError(null);
    } catch (error) {
      setRenameError(
        error instanceof Error ? error.message : "Failed to rename board.",
      );
    }
  };

  const deleteBoard = async () => {
    if (!deletingBoard) {
      return;
    }

    try {
      await window.boardStorage.delete(deletingBoard.id);
      await refreshBoards();
      setDeletingBoard(null);
    } catch (error) {
      setDashboardError(
        error instanceof Error ? error.message : "Failed to delete board.",
      );
    }
  };

  const changeBoardsFolder = async () => {
    try {
      setFolderError(null);

      const selectedFolder = await window.boardStorage.chooseFolder();

      if (!selectedFolder) {
        return;
      }

      setChangingFolder(true);

      const folder = await window.boardStorage.setFolder(selectedFolder);
      const updatedBoards = await window.boardStorage.list();

      setBoardsFolder(folder);
      setBoards(updatedBoards);
      setFolderError(null);
    } catch (error) {
      setFolderError(
        error instanceof Error
          ? error.message
          : "Failed to change the boards folder.",
      );
    } finally {
      setChangingFolder(false);
    }
  };

  const openExternalFile = async () => {
    try {
      const file = await window.boardStorage.openExternal();

      if (!file) {
        return;
      }

      await onOpenExternalFile(file);
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "Failed to open Excalidraw file.",
      );
    }
  };

  const openRecentBoard = async (recent: RecentBoardItem) => {
    if (!recent.exists) {
      setMissingRecentBoard(recent);
      return;
    }

    try {
      const opened = await window.boardStorage.openRecent(
        recent.id,
        recent.path,
        recent.kind,
      );

      if (opened.kind === "managed") {
        onOpenBoard(opened.id);
      } else {
        await onOpenExternalFile(opened);
      }
    } catch (error) {
      setDashboardError(
        error instanceof Error
          ? error.message
          : "Failed to open recent file.",
      );
      await refreshBoards();
    }
  };

  const removeMissingRecentBoard = async () => {
    if (!missingRecentBoard) {
      return;
    }

    await window.boardStorage.removeRecent(missingRecentBoard.path);
    setMissingRecentBoard(null);
    await refreshBoards();
  };

  return (
    <div className="board-dashboard">
      <div className="board-dashboard__container">
        <header className="board-dashboard__header">
          <div>
            <h1>My Boards</h1>
            <p>Your Excalidraw boards</p>
          </div>

          <div className="board-dashboard__header-actions">
            <button
              className="board-dashboard__settings-button"
              onClick={() => {
                setFolderError(null);
                setSettingsOpen(true);
              }}
              aria-label="Open settings"
              title="Settings"
            >
              ⚙
            </button>

            <button
              className="board-dashboard__secondary-button"
              onClick={() => void openExternalFile()}
            >
              Open File
            </button>

            <button
              className="board-dashboard__primary-button"
              onClick={openCreateDialog}
            >
              + New Board
            </button>
          </div>
        </header>

        {dashboardError && <p className="dialog__error">{dashboardError}</p>}

        {recentBoards.length > 0 && (
          <section className="board-dashboard__recent">
            <div className="board-dashboard__section-header">
              <div>
                <h2>Recent</h2>
                <p>Files you opened recently</p>
              </div>
            </div>

            <div className="board-dashboard__recent-list">
              {recentBoards.map((recent) => (
                <button
                  key={recent.path}
                  className={`board-dashboard__recent-item${
                    recent.exists
                      ? ""
                      : " board-dashboard__recent-item--missing"
                  }`}
                  onClick={() => void openRecentBoard(recent)}
                >
                  <span className="board-dashboard__recent-icon">✎</span>

                  <span className="board-dashboard__recent-info">
                    <span className="board-dashboard__recent-name">
                      {recent.name}
                    </span>

                    <span className="board-dashboard__recent-path">
                      {recent.exists ? recent.path : "File not found"}
                    </span>
                  </span>

                  <span className="board-dashboard__recent-time">
                    {new Date(recent.lastOpenedAt).toLocaleDateString()}
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {boards.length > 0 && (
          <div className="board-dashboard__boards-heading">
            <h2>My Boards</h2>
          </div>
        )}

        {boards.length === 0 ? (
          <div className="board-dashboard__empty">
            <div className="board-dashboard__empty-icon">✎</div>

            <h2>No boards yet</h2>

            <p>Create your first board to get started.</p>

            <button
              className="board-dashboard__primary-button"
              onClick={openCreateDialog}
            >
              Create Board
            </button>
          </div>
        ) : (
          <div className="board-grid">
            {boards.map((board) => (
              <article className="board-card" key={board.id}>
                <button
                  className="board-card__preview-button"
                  onClick={() => onOpenBoard(board.id)}
                  aria-label={`Open ${board.name}`}
                >
                  <BoardThumbnail boardId={board.id} />
                </button>

                <div className="board-card__content">
                  <button
                    className="board-card__name"
                    onClick={() => onOpenBoard(board.id)}
                  >
                    {board.name}
                  </button>

                  <p className="board-card__date">
                    {new Date(board.updatedAt).toLocaleString()}
                  </p>

                  <div className="board-card__actions">
                    <button onClick={() => openRenameDialog(board)}>
                      Rename
                    </button>

                    <button onClick={() => setDeletingBoard(board)}>
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {settingsOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSettingsOpen(false);
            }
          }}
        >
          <div className="dialog board-settings-dialog">
            <div className="board-settings-dialog__header">
              <div>
                <h2>Settings</h2>
                <p>Configure where your Excalidraw boards are stored.</p>
              </div>

              <button
                className="board-settings-dialog__close"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close settings"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="board-settings-dialog__close-icon"
                >
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <section className="board-settings-section">
              <div className="board-settings-section__title">
                <h3>Storage</h3>
                <p>Boards are saved as standard .excalidraw files.</p>
              </div>

              <div className="board-settings-folder">
                <div className="board-settings-folder__path">
                  <span className="board-settings-folder__label">
                    Boards folder
                  </span>
                  <span className="board-settings-folder__value">
                    {boardsFolder || "Loading..."}
                  </span>
                </div>

                <button
                  className="board-settings-folder__change"
                  onClick={() => void changeBoardsFolder()}
                  disabled={changingFolder}
                >
                  {changingFolder ? "Changing..." : "Change…"}
                </button>
              </div>

              {folderError && (
                <p className="dialog__error">{folderError}</p>
              )}
            </section>
          </div>
        </div>
      )}

      {creatingBoard && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>Create New Board</h2>

            <label>
              Board name
              <input
                autoFocus
                value={newBoardName}
                onChange={(event) => {
                  setNewBoardName(event.target.value);
                  setCreateError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void createBoard();
                  }

                  if (event.key === "Escape") {
                    setCreatingBoard(false);
                  }
                }}
                placeholder="e.g. Project Ideas"
              />
            </label>

            {createError && <p className="dialog__error">{createError}</p>}

            <div className="dialog__actions">
              <button onClick={() => setCreatingBoard(false)}>Cancel</button>

              <button
                className="dialog__primary"
                onClick={() => void createBoard()}
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {renamingBoard && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>Rename Board</h2>

            <label>
              Board name
              <input
                autoFocus
                value={renameValue}
                onChange={(event) => {
                  setRenameValue(event.target.value);
                  setRenameError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void renameBoard();
                  }

                  if (event.key === "Escape") {
                    setRenamingBoard(null);
                  }
                }}
              />
            </label>

            {renameError && <p className="dialog__error">{renameError}</p>}

            <div className="dialog__actions">
              <button onClick={() => setRenamingBoard(null)}>Cancel</button>

              <button
                className="dialog__primary"
                onClick={() => void renameBoard()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {deletingBoard && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>Delete Board</h2>

            <p className="dialog__message">
              Are you sure you want to delete{" "}
              <strong>{deletingBoard.name}</strong>?
            </p>

            <div className="dialog__actions">
              <button onClick={() => setDeletingBoard(null)}>Cancel</button>

              <button
                className="dialog__danger"
                onClick={() => void deleteBoard()}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {missingRecentBoard && (
        <div className="dialog-backdrop">
          <div className="dialog">
            <h2>File not found</h2>

            <p className="dialog__message">
              This file is no longer available at its original location.
            </p>

            <div className="board-dashboard__missing-path">
              {missingRecentBoard.path}
            </div>

            <div className="dialog__actions">
              <button onClick={() => setMissingRecentBoard(null)}>
                Cancel
              </button>

              <button
                className="dialog__danger"
                onClick={() => void removeMissingRecentBoard()}
              >
                Remove from Recent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
