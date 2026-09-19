const { app, BrowserWindow, ipcMain } = require("electron");
const boardStorage = require("./storage/boards.cjs");

ipcMain.handle("boards:list", () => {
  return boardStorage.listBoards();
});

ipcMain.handle("boards:save", (_, id, data) => {
  return boardStorage.saveBoard(id, data);
});

ipcMain.handle("boards:load", (_, id) => {
  return boardStorage.loadBoard(id);
});

ipcMain.handle("boards:delete", (_, id) => {
  return boardStorage.deleteBoard(id);
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
  preload: require("path").join(__dirname, "preload.cjs"),
  contextIsolation: true,
  nodeIntegration: false,
},
  });

  win.loadURL("http://localhost:3001");
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
