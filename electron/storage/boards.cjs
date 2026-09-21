const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { shell } = require("electron");

let userDataDir = null;
let boardsDir = null;
let settingsPath = null;
let thumbnailDir = null;

const SETTINGS_FILENAME = "settings.json";
const DEFAULT_BOARDS_FOLDER_NAME = "Excalidraw Custom";

function initializeStorage(userDataPath) {
  userDataDir = userDataPath;
  settingsPath = path.join(userDataDir, SETTINGS_FILENAME);
  thumbnailDir = path.join(userDataDir, "cache", "thumbnails");

  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(thumbnailDir, { recursive: true });

  const settings = readSettings();
  boardsDir =
    typeof settings.boardsFolder === "string" && settings.boardsFolder.trim()
      ? path.resolve(settings.boardsFolder)
      : path.join(require("electron").app.getPath("documents"), DEFAULT_BOARDS_FOLDER_NAME);

  fs.mkdirSync(boardsDir, { recursive: true });
}

function readSettings() {
  if (!settingsPath || !fs.existsSync(settingsPath)) {
    return {};
  }

  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    return data && typeof data === "object" ? data : {};
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  const tempPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    fs.writeFileSync(tempPath, JSON.stringify(settings, null, 2), "utf-8");
    fs.renameSync(tempPath, settingsPath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw new Error(`Failed to save settings: ${error.message}`);
  }
}

function ensureInitialized() {
  if (!boardsDir) {
    throw new Error("Board storage has not been initialized.");
  }
}

function validateBoardName(name) {
  if (typeof name !== "string") {
    throw new Error("Board name must be a string.");
  }

  const trimmed = name.trim();

  if (!trimmed) {
    throw new Error("Board name cannot be empty.");
  }

  if (trimmed.length > 100) {
    throw new Error("Board name is too long.");
  }

  if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
    throw new Error('Board name contains invalid filename characters: < > : " / \\ | ? *');
  }

  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    throw new Error("Board name cannot end with a space or period.");
  }

  const reservedName = trimmed.split(".")[0].toUpperCase();
  if (
    new Set([
      "CON",
      "PRN",
      "AUX",
      "NUL",
      "COM1",
      "COM2",
      "COM3",
      "COM4",
      "COM5",
      "COM6",
      "COM7",
      "COM8",
      "COM9",
      "LPT1",
      "LPT2",
      "LPT3",
      "LPT4",
      "LPT5",
      "LPT6",
      "LPT7",
      "LPT8",
      "LPT9",
    ]).has(reservedName)
  ) {
    throw new Error(`"${trimmed}" is not a valid Windows filename.`);
  }

  return trimmed;
}

function validateBoardId(id) {
  if (typeof id !== "string" || !id.trim()) {
    throw new Error("Board ID must be a non-empty string.");
  }

  if (id === "." || id === "..") {
    throw new Error("Invalid board ID.");
  }

  if (/[<>:"/\\|?*\x00-\x1F]/.test(id)) {
    throw new Error("Board ID contains invalid filename characters.");
  }

  if (id.endsWith(".") || id.endsWith(" ")) {
    throw new Error("Board ID cannot end with a space or period.");
  }

  if (id.length > 100) {
    throw new Error("Board ID is too long.");
  }

  return id;
}

function isExternalBoardId(id) {
  return typeof id === "string" && id.startsWith("external:");
}

function getExternalBoardPath(id) {
  if (!isExternalBoardId(id)) {
    return null;
  }

  const encodedPath = id.slice("external:".length);

  if (!encodedPath) {
    throw new Error("Invalid external board ID.");
  }

  let decodedPath;

  try {
    decodedPath = decodeURIComponent(encodedPath);
  } catch {
    throw new Error("Invalid external board ID.");
  }

  if (!path.isAbsolute(decodedPath)) {
    throw new Error("Invalid external board path.");
  }

  return path.resolve(decodedPath);
}

function getExternalBoardId(filePath) {
  return `external:${encodeURIComponent(path.resolve(filePath))}`;
}

function getBoardFilePath(id) {
  if (isExternalBoardId(id)) {
    return getExternalBoardPath(id);
  }

  return getBoardPath(id);
}

function openExternalBoard(filePath) {
  ensureInitialized();

  if (typeof filePath !== "string" || !filePath.trim()) {
    throw new Error("Invalid external board path.");
  }

  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.toLowerCase().endsWith(".excalidraw")) {
    throw new Error("Only .excalidraw files can be opened.");
  }

  if (!fs.existsSync(resolvedPath)) {
    throw new Error("The selected file does not exist.");
  }

  const id = getExternalBoardId(resolvedPath);

  // Validate the file before opening it.
  loadBoard(id);

  return {
    id,
    name: path.basename(resolvedPath, path.extname(resolvedPath)),
    path: resolvedPath,
  };
}

function getBoardPath(id) {
  ensureInitialized();

  const safeId = validateBoardId(id);
  const filePath = path.join(boardsDir, `${safeId}.excalidraw`);
  const resolvedBoardsDir = path.resolve(boardsDir);
  const resolvedFilePath = path.resolve(filePath);

  if (!resolvedFilePath.startsWith(`${resolvedBoardsDir}${path.sep}`)) {
    throw new Error("Invalid board path.");
  }

  return filePath;
}

function getBoardIdFromFilename(filename) {
  if (!filename.endsWith(".excalidraw")) {
    return null;
  }

  return filename.slice(0, -".excalidraw".length);
}

function getUniqueBoardName(requestedName) {
  const baseName = validateBoardName(requestedName);
  const existingNames = new Set(
    fs
      .readdirSync(boardsDir)
      .filter((file) => file.toLowerCase().endsWith(".excalidraw"))
      .map((file) => path.basename(file, ".excalidraw").toLowerCase()),
  );

  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }

  let counter = 2;
  while (existingNames.has(`${baseName} ${counter}`.toLowerCase())) {
    counter += 1;
  }

  return `${baseName} ${counter}`;
}

function parseBoardData(data) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Board data must be an object.");
  }

  if (parsed.type !== "excalidraw") {
    throw new Error("Invalid Excalidraw board file.");
  }

  if (!Array.isArray(parsed.elements)) {
    throw new Error("Board data is missing a valid elements array.");
  }

  if (!parsed.appState || typeof parsed.appState !== "object") {
    throw new Error("Board data is missing a valid appState.");
  }

  if (!parsed.files || typeof parsed.files !== "object") {
    parsed.files = {};
  }

  return parsed;
}

function atomicWrite(filePath, serialized) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;

  try {
    fs.writeFileSync(tempPath, serialized, "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }

    throw new Error(`Failed to save board: ${error.message}`);
  }
}

function getFileInfo(filePath) {
  const stats = fs.statSync(filePath);
  return {
    mtimeMs: stats.mtimeMs,
    size: stats.size,
  };
}

function createBoard(name) {
  ensureInitialized();

  const boardName = getUniqueBoardName(name);
  const filePath = getBoardPath(boardName);

  atomicWrite(
    filePath,
    JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://excalidraw.com",
      elements: [],
      appState: {},
      files: {},
    }),
  );

  const info = getFileInfo(filePath);

  return {
    id: boardName,
    name: boardName,
    updatedAt: new Date(info.mtimeMs).toISOString(),
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

function saveBoard(id, data, expectedMtimeMs = null, force = false) {
  const filePath = getBoardFilePath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Board not found: ${id}`);
  }

  const currentInfo = getFileInfo(filePath);

  if (
    !force &&
    typeof expectedMtimeMs === "number" &&
    Math.abs(currentInfo.mtimeMs - expectedMtimeMs) > 0.5
  ) {
    return {
      status: "conflict",
      currentMtimeMs: currentInfo.mtimeMs,
      currentSize: currentInfo.size,
    };
  }

  const parsedData = parseBoardData(data);
  atomicWrite(filePath, JSON.stringify(parsedData, null, 2));

  const info = getFileInfo(filePath);

  return {
    status: "saved",
    mtimeMs: info.mtimeMs,
    size: info.size,
    updatedAt: new Date(info.mtimeMs).toISOString(),
  };
}

function loadBoard(id) {
  const filePath = getBoardFilePath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Board not found: ${id}`);
  }

  let parsedData;
  try {
    parsedData = parseBoardData(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    throw new Error(`Board "${id}" is corrupted or unreadable: ${error.message}`);
  }

  const info = getFileInfo(filePath);

  return {
    data: parsedData,
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

async function deleteBoard(id) {
  const filePath = getBoardPath(id);

  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    await shell.trashItem(filePath);
  } catch (error) {
    throw new Error(`Failed to delete board "${id}": ${error.message}`);
  }
}

function renameBoard(id, newName) {
  const oldPath = getBoardPath(id);

  if (!fs.existsSync(oldPath)) {
    throw new Error(`Board not found: ${id}`);
  }

  const boardName = validateBoardName(newName);

  const collision = fs
    .readdirSync(boardsDir)
    .filter((file) => file.toLowerCase().endsWith(".excalidraw"))
    .some((file) => {
      const existingId = getBoardIdFromFilename(file);
      return existingId && existingId.toLowerCase() === boardName.toLowerCase() && existingId !== id;
    });

  if (collision) {
    throw new Error("A board with this name already exists.");
  }

  const newPath = getBoardPath(boardName);

  if (path.resolve(oldPath) !== path.resolve(newPath)) {
    try {
      fs.renameSync(oldPath, newPath);
    } catch (error) {
      throw new Error(`Failed to rename board "${id}": ${error.message}`);
    }
  }

  const info = getFileInfo(newPath);

  return {
    id: boardName,
    name: boardName,
    updatedAt: new Date(info.mtimeMs).toISOString(),
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

function listBoards() {
  ensureInitialized();

  return fs
    .readdirSync(boardsDir)
    .filter((file) => file.toLowerCase().endsWith(".excalidraw"))
    .map((file) => {
      const id = getBoardIdFromFilename(file);
      const filePath = getBoardPath(id);
      const info = getFileInfo(filePath);

      return {
        id,
        name: id,
        updatedAt: new Date(info.mtimeMs).toISOString(),
        mtimeMs: info.mtimeMs,
        size: info.size,
      };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function getBoardsFolder() {
  ensureInitialized();
  return boardsDir;
}

function setBoardsFolder(folderPath) {
  ensureInitialized();

  if (typeof folderPath !== "string" || !folderPath.trim()) {
    throw new Error("Boards folder must be a non-empty path.");
  }

  const resolved = path.resolve(folderPath);
  fs.mkdirSync(resolved, { recursive: true });

  boardsDir = resolved;
  writeSettings({ ...readSettings(), boardsFolder: resolved });

  return resolved;
}

function getThumbnailKey(boardId) {
  const filePath = getBoardPath(boardId);
  const info = getFileInfo(filePath);
  const hash = crypto
    .createHash("sha256")
    .update(`${path.resolve(filePath)}:${info.mtimeMs}:${info.size}`)
    .digest("hex");

  return { filePath, info, key: hash };
}

function getThumbnail(boardId) {
  try {
    const { key } = getThumbnailKey(boardId);
    const thumbnailPath = path.join(thumbnailDir, `${key}.png`);

    if (!fs.existsSync(thumbnailPath)) {
      return null;
    }

    return `data:image/png;base64,${fs.readFileSync(thumbnailPath).toString("base64")}`;
  } catch {
    return null;
  }
}

function saveThumbnail(boardId, dataUrl) {
  const { key } = getThumbnailKey(boardId);
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) {
    throw new Error("Invalid thumbnail data.");
  }

  const thumbnailPath = path.join(thumbnailDir, `${key}.png`);
  const buffer = Buffer.from(dataUrl.slice(prefix.length), "base64");
  fs.writeFileSync(thumbnailPath, buffer);

  return thumbnailPath;
}

module.exports = {
  initializeStorage,
  getBoardsFolder,
  setBoardsFolder,
  createBoard,
  saveBoard,
  loadBoard,
  openExternalBoard,
  deleteBoard,
  renameBoard,
  listBoards,
  getThumbnail,
  saveThumbnail,
};
