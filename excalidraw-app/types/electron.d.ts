export {};

declare global {
  interface Window {
    boardStorage: {
      list: () => Promise<any[]>;
      save: (id: string, data: string) => Promise<string>;
      load: (id: string) => Promise<any>;
      delete: (id: string) => Promise<void>;
    };
  }
}
