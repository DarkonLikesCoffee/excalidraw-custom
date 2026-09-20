const { app, BrowserWindow, ipcMain, Menu } = require("electron");
const boardStorage = require("./storage/boards.cjs");

ipcMain.handle("boards:list", () => {
  return boardStorage.listBoards();
});

ipcMain.handle("boards:create", (_, name) => {
  return boardStorage.createBoard(name);
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

ipcMain.handle("boards:rename", (_, id, newName) => {
  return boardStorage.renameBoard(id, newName);
});

ipcMain.on("window:minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.on("window:maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);

  if (!win) {
    return;
  }

  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

ipcMain.on("window:close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    frame: false,
    titleBarStyle: "hidden",
    webPreferences: {
      preload: require("path").join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.webContents.on("before-input-event", (event, input) => {
    if (
      input.type === "keyDown" &&
      input.control &&
      input.shift &&
      input.key.toLowerCase() === "i"
    ) {
      win.webContents.toggleDevTools();
    }
  });

  win.loadURL("http://localhost:3001");
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);

  boardStorage.initializeStorage(app.getPath("userData"));

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
