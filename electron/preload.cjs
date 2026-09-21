const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("boardStorage", {
  list: () => ipcRenderer.invoke("boards:list"),
  create: (name) => ipcRenderer.invoke("boards:create", name),
  duplicate: (id) => ipcRenderer.invoke("boards:duplicate", id),
  save: (id, data, expectedMtimeMs, force = false) =>
    ipcRenderer.invoke("boards:save", id, data, expectedMtimeMs, force),
  load: (id) => ipcRenderer.invoke("boards:load", id),
  delete: (id) => ipcRenderer.invoke("boards:delete", id),
  rename: (id, newName) => ipcRenderer.invoke("boards:rename", id, newName),
  getFolder: () => ipcRenderer.invoke("boards:get-folder"),
  setFolder: (folderPath) => ipcRenderer.invoke("boards:set-folder", folderPath),
  chooseFolder: () => ipcRenderer.invoke("boards:choose-folder"),
  openExternal: () => ipcRenderer.invoke("boards:open-external"),
  openRecent: (id, filePath, kind) =>
    ipcRenderer.invoke("boards:open-recent", id, filePath, kind),
  getRecent: () => ipcRenderer.invoke("boards:get-recent"),
  removeRecent: (filePath) =>
    ipcRenderer.invoke("boards:remove-recent", filePath),
  stopExternalWatch: () => ipcRenderer.invoke("boards:stop-external-watch"),
  getThumbnail: (id) => ipcRenderer.invoke("boards:get-thumbnail", id),
  saveThumbnail: (id, dataUrl) =>
    ipcRenderer.invoke("boards:save-thumbnail", id, dataUrl),
  onChange: (callback) => {
    const listener = (_, payload) => callback(payload);
    ipcRenderer.on("boards:changed", listener);

    return () => {
      ipcRenderer.removeListener("boards:changed", listener);
    };
  },
});

contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
});
