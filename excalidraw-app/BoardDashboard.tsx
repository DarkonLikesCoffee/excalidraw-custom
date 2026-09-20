import { useEffect, useState } from "react";
import "./board-dashboard.css";
import { BoardThumbnail } from "./BoardThumbnail";

type Board = {
  id: string;
  name: string;
  updatedAt: string;
};

type BoardDashboardProps = {
  onOpenBoard: (boardId: string) => void;
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

  const nameWithoutExtension = trimmed.split(".")[0].toUpperCase();

  if (WINDOWS_RESERVED_NAMES.has(nameWithoutExtension)) {
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

export const BoardDashboard = ({ onOpenBoard }: BoardDashboardProps) => {
  const [boards, setBoards] = useState<Board[]>([]);

  const [renamingBoard, setRenamingBoard] = useState<Board | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);

  const [deletingBoard, setDeletingBoard] = useState<Board | null>(null);

  const [creatingBoard, setCreatingBoard] = useState(false);
  const [newBoardName, setNewBoardName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    window.boardStorage.list().then(setBoards);
  }, []);

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

      const updatedBoards = await window.boardStorage.list();
      setBoards(updatedBoards);

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

    const newName = renameValue.trim();

    await window.boardStorage.rename(renamingBoard.id, newName);

    const updatedBoards = await window.boardStorage.list();

    setBoards(updatedBoards);
    setRenamingBoard(null);
    setRenameValue("");
    setRenameError(null);
  };

  const deleteBoard = async () => {
    if (!deletingBoard) {
      return;
    }

    await window.boardStorage.delete(deletingBoard.id);

    const updatedBoards = await window.boardStorage.list();

    setBoards(updatedBoards);
    setDeletingBoard(null);
  };

  return (
    <div className="board-dashboard">
      <div className="board-dashboard__container">
        <header className="board-dashboard__header">
          <div>
            <h1>My Boards</h1>
            <p>Your Excalidraw boards</p>
          </div>

          <button
            className="board-dashboard__primary-button"
            onClick={openCreateDialog}
          >
            + New Board
          </button>
        </header>

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

      {/* Create dialog */}
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
                    createBoard();
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

              <button className="dialog__primary" onClick={createBoard}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename dialog */}
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
                    renameBoard();
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

              <button className="dialog__primary" onClick={renameBoard}>
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete dialog */}
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

              <button className="dialog__danger" onClick={deleteBoard}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
