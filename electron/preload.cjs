const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("boardStorage", {
  list: () => ipcRenderer.invoke("boards:list"),
  save: (id, data) => ipcRenderer.invoke("boards:save", id, data),
  load: (id) => ipcRenderer.invoke("boards:load", id),
  delete: (id) => ipcRenderer.invoke("boards:delete", id),
  rename: (id, newName) =>
  ipcRenderer.invoke("boards:rename", id, newName),
});
contextBridge.exposeInMainWorld("windowControls", {
  minimize: () => ipcRenderer.send("window:minimize"),
  maximize: () => ipcRenderer.send("window:maximize"),
  close: () => ipcRenderer.send("window:close"),
});