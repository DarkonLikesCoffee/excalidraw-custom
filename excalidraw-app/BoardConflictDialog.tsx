import "./board-conflict-dialog.css";

type BoardConflictDialogProps = {
  boardName: string;
  onKeepMine: () => void;
  onLoadTheirs: () => void;
  onSaveCopy: () => void;
};

export const BoardConflictDialog = ({
  boardName,
  onKeepMine,
  onLoadTheirs,
  onSaveCopy,
}: BoardConflictDialogProps) => (
  <div className="board-conflict-backdrop">
    <div className="board-conflict-dialog" role="dialog" aria-modal="true">
      <h2>Board changed on disk</h2>

      <p>
        <strong>{boardName}</strong> was changed outside this app while you
        had it open. Choose which version to keep.
      </p>

      <div className="board-conflict-actions">
        <button onClick={onLoadTheirs}>Load theirs</button>
        <button onClick={onSaveCopy}>Save a copy</button>
        <button className="board-conflict-primary" onClick={onKeepMine}>
          Keep mine
        </button>
      </div>
    </div>
  </div>
);
