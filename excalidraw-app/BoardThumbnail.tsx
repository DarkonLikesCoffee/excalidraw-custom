import { useEffect, useState } from "react";
import { getDefaultAppState } from "@excalidraw/excalidraw/appState";
import { exportToCanvas } from "@excalidraw/excalidraw/scene/export";
import { getNonDeletedElements } from "@excalidraw/element";

import "./board-thumbnail.css";

type BoardThumbnailProps = {
  boardId: string;
};

export const BoardThumbnail = ({ boardId }: BoardThumbnailProps) => {
  const [thumbnail, setThumbnail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const generateThumbnail = async () => {
      setLoading(true);
      setThumbnail(null);

      try {
        const data = await window.boardStorage.load(boardId);

        if (!data.elements || data.elements.length === 0) {
          return;
        }

        const elements = getNonDeletedElements(data.elements);

        if (elements.length === 0) {
          return;
        }

        const appState = {
          ...getDefaultAppState(),
          ...data.appState,
          exportScale: 1,
        };

        const canvas = await exportToCanvas(
          elements,
          appState as any,
          data.files || {},
          {
            exportBackground: true,
            viewBackgroundColor:
              data.appState?.viewBackgroundColor || "#ffffff",
            exportPadding: 20,
          },
        );

        if (!cancelled) {
          setThumbnail(canvas.toDataURL("image/png"));
        }
      } catch (error) {
        console.error(
          `[BoardThumbnail] Failed to generate thumbnail for "${boardId}"`,
          error,
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    generateThumbnail();

    return () => {
      cancelled = true;
    };
  }, [boardId]);

  return (
    <div className="board-card__preview">
      {thumbnail ? (
        <img className="board-card__thumbnail" src={thumbnail} alt="" />
      ) : loading ? (
        <div className="board-card__thumbnail-loading" />
      ) : (
        <div className="board-card__thumbnail-empty">
          <span>✎</span>
        </div>
      )}
    </div>
  );
};
