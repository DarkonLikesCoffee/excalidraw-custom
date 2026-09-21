const fs = require("fs");
const path = require("path");
const { app, BrowserWindow, ipcMain, Menu, dialog } = require("electron");
const boardStorage = require("./storage/boards.cjs");

let boardsWatcher = null;
let boardsWatchTimer = null;
let externalWatcher = null;
let externalWatchTimer = null;


function stopExternalWatcher() {
  if (externalWatchTimer) {
    clearTimeout(externalWatchTimer);
    externalWatchTimer = null;
  }

  if (externalWatcher) {
    externalWatcher.close();
    externalWatcher = null;
  }
}

function startExternalWatcher(filePath, boardId) {
  stopExternalWatcher();

  const directory = path.dirname(filePath);
  const targetFilename = path.basename(filePath);

  externalWatcher = fs.watch(
    directory,
    { persistent: false },
    (eventType, filename) => {
      if (!filename || filename.toString() !== targetFilename) {
        return;
      }

      if (externalWatchTimer) {
        clearTimeout(externalWatchTimer);
      }

      externalWatchTimer = setTimeout(() => {
        externalWatchTimer = null;
        broadcastBoardsChanged({ eventType, filename: boardId });
      }, 100);
    },
  );
}

function broadcastBoardsChanged(payload) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send("boards:changed", payload);
    }
  }
}

function stopBoardsWatcher() {
  if (boardsWatchTimer) {
    clearTimeout(boardsWatchTimer);
    boardsWatchTimer = null;
  }

  if (boardsWatcher) {
    boardsWatcher.close();
    boardsWatcher = null;
  }

  stopExternalWatcher();
}

function startBoardsWatcher() {
  stopBoardsWatcher();

  const boardsFolder = boardStorage.getBoardsFolder();

  boardsWatcher = fs.watch(
    boardsFolder,
    { persistent: false },
    (eventType, filename) => {
      if (boardsWatchTimer) {
        clearTimeout(boardsWatchTimer);
      }

      boardsWatchTimer = setTimeout(() => {
        boardsWatchTimer = null;

        broadcastBoardsChanged({
          eventType,
          filename: filename ? filename.toString() : null,
        });
      }, 100);
    },
  );
}

ipcMain.handle("boards:list", () => boardStorage.listBoards());

ipcMain.handle("boards:create", (_, name) => boardStorage.createBoard(name));

ipcMain.handle("boards:save", (_, id, data, expectedMtimeMs, force) =>
  boardStorage.saveBoard(id, data, expectedMtimeMs, force),
);

ipcMain.handle("boards:load", (_, id) => {
  const result = boardStorage.loadBoard(id);
  boardStorage.addRecentBoard(id);
  return result;
});

ipcMain.handle("boards:delete", async (_, id) => {
  await boardStorage.deleteBoard(id);
});

ipcMain.handle("boards:rename", (_, id, newName) =>
  boardStorage.renameBoard(id, newName),
);

ipcMain.handle("boards:get-folder", () => boardStorage.getBoardsFolder());

ipcMain.handle("boards:set-folder", (_, folderPath) => {
  const result = boardStorage.setBoardsFolder(folderPath);
  startBoardsWatcher();
  broadcastBoardsChanged({ eventType: "folder-changed", filename: null });
  return result;
});

ipcMain.handle("boards:choose-folder", async () => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
    title: "Choose Boards Folder",
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle("boards:get-thumbnail", (_, id) =>
  boardStorage.getThumbnail(id),
);

ipcMain.handle("boards:save-thumbnail", (_, id, dataUrl) =>
  boardStorage.saveThumbnail(id, dataUrl),
);

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
      preload: path.join(__dirname, "preload.cjs"),
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
  startBoardsWatcher();

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopBoardsWatcher();

  if (process.platform !== "darwin") {
    app.quit();
  }
});


ipcMain.handle("boards:open-external", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open Excalidraw File",
    properties: ["openFile"],
    filters: [{ name: "Excalidraw files", extensions: ["excalidraw"] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const opened = boardStorage.openExternalBoard(result.filePaths[0]);
  boardStorage.addRecentBoard(opened.id);
  startExternalWatcher(opened.path, opened.id);

  return {
    id: opened.id,
    name: opened.name,
    path: opened.path,
    kind: opened.kind,
  };
});

ipcMain.handle("boards:open-recent", (_, id, filePath, kind) => {
  const opened = boardStorage.openRecentBoard(id, filePath, kind);
  boardStorage.addRecentBoard(opened.id);

  if (opened.kind === "external") {
    startExternalWatcher(opened.path, opened.id);
  } else {
    stopExternalWatcher();
  }

  return {
    id: opened.id,
    name: opened.name,
    path: opened.path,
    kind: opened.kind,
  };
});

ipcMain.handle("boards:get-recent", () => boardStorage.getRecentBoards());

ipcMain.handle("boards:remove-recent", (_, filePath) => {
  boardStorage.removeRecentBoard(filePath);
});

ipcMain.handle("boards:stop-external-watch", () => {
  stopExternalWatcher();
});
