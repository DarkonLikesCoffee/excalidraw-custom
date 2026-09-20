export {};

declare global {
  interface Window {
    boardStorage: {
      list: () => Promise<any[]>;

      create: (name: string) => Promise<{
        id: string;
        name: string;
        updatedAt: string;
      }>;

      save: (id: string, data: string) => Promise<string>;

      load: (id: string) => Promise<any>;

      delete: (id: string) => Promise<void>;

      rename: (
        id: string,
        newName: string,
      ) => Promise<{
        id: string;
        name: string;
      }>;
    };
    windowControls: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}
