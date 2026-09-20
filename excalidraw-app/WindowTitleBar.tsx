import "./window-title-bar.css";

type WindowTitleBarProps = {
  showDashboardButton?: boolean;
  onDashboard?: () => void;
};

export const WindowTitleBar = ({
  showDashboardButton = false,
  onDashboard,
}: WindowTitleBarProps) => {
  return (
    <div className="window-title-bar">
      <div className="window-title-bar__drag-area">
        {showDashboardButton && (
          <button className="window-title-bar__dashboard" onClick={onDashboard}>
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M7.5 2.5L4 6l3.5 3.5" />
            </svg>

            <span>Dashboard</span>
          </button>
        )}

        <span className="window-title-bar__title">Excalidraw Custom</span>
      </div>

      <div className="window-title-bar__controls">
        <button
          className="window-title-bar__button"
          onClick={() => window.windowControls.minimize()}
          aria-label="Minimize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1 5h8" />
          </svg>
        </button>

        <button
          className="window-title-bar__button"
          onClick={() => window.windowControls.maximize()}
          aria-label="Maximize"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="1.5" y="1.5" width="7" height="7" />
          </svg>
        </button>

        <button
          className="window-title-bar__button window-title-bar__close"
          onClick={() => window.windowControls.close()}
          aria-label="Close"
        >
          <svg width="10" height="10" viewBox="0 0 10 10">
            <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
