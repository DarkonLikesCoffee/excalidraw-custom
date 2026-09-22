export {};

declare global {
  type BoardStorageItem = {
    id: string;
    name: string;
    path: string;
    relativePath: string;
    folderPath: string;
    updatedAt: string;
    mtimeMs: number;
    size: number;
  };

  type BoardStorageFolder = { name: string; relativePath: string };
  type BoardStorageListing = { boards: BoardStorageItem[]; folders: BoardStorageFolder[] };

  type ExternalBoardOpenResult = { id: string; name: string; path: string; kind: "external" };
  type RecentBoardItem = { id: string; name: string; path: string; kind: "managed" | "external"; lastOpenedAt: string; exists: boolean };
  type RecentBoardOpenResult = { id: string; name: string; path: string; kind: "managed" | "external" };
  type BoardLoadResult = {
    data: { type: "excalidraw"; version: number; source?: string; elements: any[]; appState: Record<string, unknown>; files: Record<string, any>; };
    mtimeMs: number;
    size: number;
  };
  type BoardSaveResult =
    | { status: "saved"; mtimeMs: number; size: number; updatedAt: string }
    | { status: "conflict"; currentMtimeMs: number; currentSize: number };

  interface Window {
    boardStorage: {
      list: (relativeFolderPath?: string) => Promise<BoardStorageListing>;
      create: (name: string, relativeFolderPath?: string) => Promise<BoardStorageItem>;
      duplicate: (id: string) => Promise<BoardStorageItem>;
      move: (id: string, destinationRelativeFolderPath: string) => Promise<BoardStorageItem>;
      createFolder: (relativeParentPath: string, name: string) => Promise<BoardStorageFolder>;
      listFolders: () => Promise<BoardStorageFolder[]>;
      save: (id: string, data: string, expectedMtimeMs?: number | null, force?: boolean) => Promise<BoardSaveResult>;
      load: (id: string) => Promise<BoardLoadResult>;
      delete: (id: string) => Promise<void>;
      rename: (id: string, newName: string) => Promise<BoardStorageItem>;
      getFolder: () => Promise<string>;
      setFolder: (folderPath: string) => Promise<string>;
      chooseFolder: () => Promise<string | null>;
      openExternal: () => Promise<ExternalBoardOpenResult | null>;
      openRecent: (id: string, filePath: string, kind: "managed" | "external") => Promise<RecentBoardOpenResult>;
      getRecent: () => Promise<RecentBoardItem[]>;
      removeRecent: (filePath: string) => Promise<void>;
      stopExternalWatch: () => Promise<void>;
      getThumbnail: (id: string) => Promise<string | null>;
      saveThumbnail: (id: string, dataUrl: string) => Promise<string>;
      onChange: (callback: (payload: { eventType: string; filename: string | null }) => void) => () => void;
    };
    windowControls: { minimize: () => void; maximize: () => void; close: () => void };
  }
}
