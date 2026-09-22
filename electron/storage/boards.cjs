const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { shell, app } = require("electron");

let userDataDir = null;
let boardsDir = null;
let settingsPath = null;
let thumbnailDir = null;

const SETTINGS_FILENAME = "settings.json";
const DEFAULT_BOARDS_FOLDER_NAME = "Excalidraw Custom";
const BOARD_ID_KEY = "excalidrawCustomId";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
      : path.join(app.getPath("documents"), DEFAULT_BOARDS_FOLDER_NAME);

  fs.mkdirSync(boardsDir, { recursive: true });
}

function readSettings() {
  if (!settingsPath || !fs.existsSync(settingsPath)) return {};
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
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw new Error(`Failed to save settings: ${error.message}`);
  }
}

function ensureInitialized() {
  if (!boardsDir) throw new Error("Board storage has not been initialized.");
}

function validateName(name, label = "Name") {
  if (typeof name !== "string") throw new Error(`${label} must be a string.`);
  const trimmed = name.trim();
  if (!trimmed) throw new Error(`${label} cannot be empty.`);
  if (trimmed.length > 100) throw new Error(`${label} is too long.`);
  if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmed)) {
    throw new Error(`${label} contains invalid filename characters: < > : " / \\ | ? *`);
  }
  if (trimmed.endsWith(".") || trimmed.endsWith(" ")) {
    throw new Error(`${label} cannot end with a space or period.`);
  }
  const reservedName = trimmed.split(".")[0].toUpperCase();
  if (new Set(["CON","PRN","AUX","NUL","COM1","COM2","COM3","COM4","COM5","COM6","COM7","COM8","COM9","LPT1","LPT2","LPT3","LPT4","LPT5","LPT6","LPT7","LPT8","LPT9"]).has(reservedName)) {
    throw new Error(`"${trimmed}" is not a valid Windows filename.`);
  }
  return trimmed;
}

function validateBoardName(name) { return validateName(name, "Board name"); }
function validateFolderName(name) { return validateName(name, "Folder name"); }

function validateBoardId(id) {
  if (typeof id !== "string" || !id.trim()) throw new Error("Board ID must be a non-empty string.");
  if (isExternalBoardId(id)) return id;
  if (!UUID_RE.test(id)) throw new Error("Invalid managed board ID.");
  return id;
}

function isManagedBoardId(id) { return typeof id === "string" && UUID_RE.test(id); }
function isExternalBoardId(id) { return typeof id === "string" && id.startsWith("external:"); }

function getExternalBoardPath(id) {
  if (!isExternalBoardId(id)) return null;
  const encodedPath = id.slice("external:".length);
  let decodedPath;
  try { decodedPath = decodeURIComponent(encodedPath); } catch { throw new Error("Invalid external board ID."); }
  if (!path.isAbsolute(decodedPath)) throw new Error("Invalid external board path.");
  return path.resolve(decodedPath);
}

function getExternalBoardId(filePath) {
  return `external:${encodeURIComponent(path.resolve(filePath))}`;
}

function normalizeRelativePath(relativePath = "") {
  if (typeof relativePath !== "string") throw new Error("Invalid folder path.");
  const normalizedInput = relativePath.replace(/\\/g, "/").trim();
  if (!normalizedInput || normalizedInput === ".") return "";
  if (normalizedInput.startsWith("/") || /^[A-Za-z]:\//.test(normalizedInput)) throw new Error("Invalid folder path.");
  const parts = normalizedInput.split("/").filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error("Invalid folder path.");
  return parts.join("/");
}

function getFolderPath(relativePath = "") {
  ensureInitialized();
  const normalized = normalizeRelativePath(relativePath);
  const root = path.resolve(boardsDir);
  const resolved = path.resolve(root, ...normalized.split("/").filter(Boolean));
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Invalid folder path.");
  return resolved;
}

function getRelativePath(filePath) {
  const relative = path.relative(path.resolve(boardsDir), path.resolve(filePath));
  return relative.split(path.sep).join("/");
}

function isInsideBoardsFolder(filePath) {
  const root = path.resolve(boardsDir);
  const resolved = path.resolve(filePath);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

function atomicWrite(filePath, serialized) {
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(tempPath, serialized, "utf-8");
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    throw new Error(`Failed to save board: ${error.message}`);
  }
}

function parseBoardData(data) {
  const parsed = typeof data === "string" ? JSON.parse(data) : data;
  if (!parsed || typeof parsed !== "object") throw new Error("Board data must be an object.");
  if (parsed.type !== "excalidraw") throw new Error("Invalid Excalidraw board file.");
  if (!Array.isArray(parsed.elements)) throw new Error("Board data is missing a valid elements array.");
  if (!parsed.appState || typeof parsed.appState !== "object") throw new Error("Board data is missing a valid appState.");
  if (!parsed.files || typeof parsed.files !== "object") parsed.files = {};
  return parsed;
}

function getCustomId(data) {
  return data?.custom && typeof data.custom === "object" && typeof data.custom[BOARD_ID_KEY] === "string" && UUID_RE.test(data.custom[BOARD_ID_KEY])
    ? data.custom[BOARD_ID_KEY]
    : null;
}

function withBoardId(data, boardId) {
  const parsed = parseBoardData(data);
  parsed.custom = parsed.custom && typeof parsed.custom === "object" ? parsed.custom : {};
  parsed.custom[BOARD_ID_KEY] = boardId;
  return parsed;
}

function ensureManagedBoardIdentity(filePath, data = null) {
  let parsed = data;
  if (!parsed) parsed = parseBoardData(fs.readFileSync(filePath, "utf-8"));
  const existingId = getCustomId(parsed);
  if (existingId) return { data: parsed, id: existingId, changed: false };

  const id = crypto.randomUUID();
  const updated = withBoardId(parsed, id);
  atomicWrite(filePath, JSON.stringify(updated, null, 2));
  return { data: updated, id, changed: true };
}

function readManagedBoard(filePath, persistIdentity = true) {
  let parsed;
  try { parsed = parseBoardData(fs.readFileSync(filePath, "utf-8")); }
  catch (error) { throw new Error(`Board is corrupted or unreadable: ${error.message}`); }

  if (!persistIdentity) {
    return { data: parsed, id: getCustomId(parsed) };
  }

  return ensureManagedBoardIdentity(filePath, parsed);
}

function getFileInfo(filePath) {
  const stats = fs.statSync(filePath);
  return { mtimeMs: stats.mtimeMs, size: stats.size };
}

function listDirectory(relativeFolderPath = "") {
  const directoryPath = getFolderPath(relativeFolderPath);
  if (!fs.existsSync(directoryPath)) throw new Error("Folder not found.");
  if (!fs.statSync(directoryPath).isDirectory()) throw new Error("The selected path is not a folder.");

  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });
  const folders = [];
  const boards = [];

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, relativePath: getRelativePath(entryPath) });
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".excalidraw")) continue;

    try {
      const identity = readManagedBoard(entryPath, true);
      const info = getFileInfo(entryPath);
      const name = path.basename(entry.name, ".excalidraw");
      boards.push({
        id: identity.id,
        name,
        path: path.resolve(entryPath),
        relativePath: getRelativePath(entryPath),
        folderPath: getRelativePath(directoryPath),
        updatedAt: new Date(info.mtimeMs).toISOString(),
        mtimeMs: info.mtimeMs,
        size: info.size,
      });
    } catch {
      // Invalid .excalidraw files remain hidden from managed boards rather than breaking the dashboard.
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
  boards.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return { folders, boards };
}

function scanManagedFiles(directoryPath = boardsDir, results = []) {
  if (!fs.existsSync(directoryPath)) return results;
  for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) scanManagedFiles(entryPath, results);
    else if (entry.isFile() && entry.name.toLowerCase().endsWith(".excalidraw")) results.push(entryPath);
  }
  return results;
}

function findManagedBoardById(id) {
  if (!isManagedBoardId(id)) return null;
  for (const filePath of scanManagedFiles()) {
    try {
      const identity = readManagedBoard(filePath, true);
      if (identity.id === id) return filePath;
    } catch {}
  }
  return null;
}

function getBoardFilePath(id) {
  ensureInitialized();
  if (isExternalBoardId(id)) return getExternalBoardPath(id);
  const safeId = validateBoardId(id);
  const filePath = findManagedBoardById(safeId);
  if (!filePath) throw new Error(`Board not found: ${id}`);
  return filePath;
}

function getUniqueBoardName(directoryPath, requestedName) {
  const baseName = validateBoardName(requestedName);
  const existingNames = new Set(
    fs.readdirSync(directoryPath, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".excalidraw"))
      .map((entry) => path.basename(entry.name, ".excalidraw").toLowerCase()),
  );
  if (!existingNames.has(baseName.toLowerCase())) return baseName;
  let counter = 2;
  while (existingNames.has(`${baseName} ${counter}`.toLowerCase())) counter += 1;
  return `${baseName} ${counter}`;
}

function createBoard(name, relativeFolderPath = "") {
  const directoryPath = getFolderPath(relativeFolderPath);
  const boardName = getUniqueBoardName(directoryPath, name);
  const filePath = path.join(directoryPath, `${boardName}.excalidraw`);
  const id = crypto.randomUUID();
  atomicWrite(filePath, JSON.stringify(withBoardId({ type: "excalidraw", version: 2, source: "https://excalidraw.com", elements: [], appState: {}, files: {} }, id), null, 2));
  return boardSummary(filePath, id);
}

function boardSummary(filePath, id = null) {
  const info = getFileInfo(filePath);
  let resolvedId = id;
  if (!resolvedId) resolvedId = readManagedBoard(filePath, true).id;
  return {
    id: resolvedId,
    name: path.basename(filePath, ".excalidraw"),
    path: path.resolve(filePath),
    relativePath: getRelativePath(filePath),
    folderPath: getRelativePath(path.dirname(filePath)),
    updatedAt: new Date(info.mtimeMs).toISOString(),
    mtimeMs: info.mtimeMs,
    size: info.size,
  };
}

function duplicateBoard(id) {
  const sourcePath = getBoardFilePath(id);
  if (!fs.existsSync(sourcePath)) throw new Error(`Board not found: ${id}`);
  const directoryPath = path.dirname(sourcePath);
  const boardName = getUniqueBoardName(directoryPath, `${path.basename(sourcePath, ".excalidraw")} copy`);
  const targetPath = path.join(directoryPath, `${boardName}.excalidraw`);
  let data = readManagedBoard(sourcePath, true).data;
  data = withBoardId(data, crypto.randomUUID());
  atomicWrite(targetPath, JSON.stringify(data, null, 2));
  return boardSummary(targetPath);
}

function saveBoard(id, data, expectedMtimeMs = null, force = false) {
  const filePath = getBoardFilePath(id);
  if (!fs.existsSync(filePath)) throw new Error(`Board not found: ${id}`);
  const currentInfo = getFileInfo(filePath);
  if (!force && typeof expectedMtimeMs === "number" && Math.abs(currentInfo.mtimeMs - expectedMtimeMs) > 0.5) {
    return { status: "conflict", currentMtimeMs: currentInfo.mtimeMs, currentSize: currentInfo.size };
  }
  const parsedData = parseBoardData(data);
  const existingIdentity = isManagedBoardId(id) ? id : getCustomId(parsedData);
  const dataToWrite = isManagedBoardId(id) ? withBoardId(parsedData, existingIdentity) : parsedData;
  atomicWrite(filePath, JSON.stringify(dataToWrite, null, 2));
  const info = getFileInfo(filePath);
  return { status: "saved", mtimeMs: info.mtimeMs, size: info.size, updatedAt: new Date(info.mtimeMs).toISOString() };
}

function loadBoard(id) {
  const filePath = getBoardFilePath(id);
  if (!fs.existsSync(filePath)) throw new Error(`Board not found: ${id}`);
  let parsedData;
  try {
    parsedData = parseBoardData(fs.readFileSync(filePath, "utf-8"));
    if (isManagedBoardId(id)) parsedData = ensureManagedBoardIdentity(filePath, parsedData).data;
  } catch (error) {
    throw new Error(`Board "${id}" is corrupted or unreadable: ${error.message}`);
  }
  const info = getFileInfo(filePath);
  return { data: parsedData, mtimeMs: info.mtimeMs, size: info.size };
}

async function deleteBoard(id) {
  const filePath = getBoardFilePath(id);
  if (!fs.existsSync(filePath)) return;
  try { await shell.trashItem(filePath); }
  catch (error) { throw new Error(`Failed to delete board: ${error.message}`); }
}

function renameBoard(id, newName) {
  const oldPath = getBoardFilePath(id);
  if (!fs.existsSync(oldPath)) throw new Error(`Board not found: ${id}`);
  const boardName = validateBoardName(newName);
  const newPath = path.join(path.dirname(oldPath), `${boardName}.excalidraw`);
  if (path.resolve(oldPath) !== path.resolve(newPath) && fs.existsSync(newPath)) throw new Error("A board with this name already exists in this folder.");
  fs.renameSync(oldPath, newPath);
  return boardSummary(newPath, id);
}

function createFolder(relativeParentPath = "", name) {
  const parentPath = getFolderPath(relativeParentPath);
  const folderName = validateFolderName(name);
  const targetPath = path.join(parentPath, folderName);
  if (fs.existsSync(targetPath)) throw new Error("A folder with this name already exists here.");
  fs.mkdirSync(targetPath);
  return { name: folderName, relativePath: getRelativePath(targetPath) };
}

function listAllFolders() {
  const folders = [{ name: "My Boards", relativePath: "" }];
  function walk(directoryPath) {
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const folderPath = path.join(directoryPath, entry.name);
      folders.push({ name: entry.name, relativePath: getRelativePath(folderPath) });
      walk(folderPath);
    }
  }
  walk(boardsDir);
  return folders;
}

function moveBoard(id, destinationRelativeFolderPath) {
  const sourcePath = getBoardFilePath(id);
  const destinationDir = getFolderPath(destinationRelativeFolderPath);
  if (!fs.existsSync(sourcePath)) throw new Error(`Board not found: ${id}`);
  if (!fs.existsSync(destinationDir)) throw new Error("Destination folder not found.");
  const targetPath = path.join(destinationDir, path.basename(sourcePath));
  if (path.resolve(sourcePath) === path.resolve(targetPath)) return boardSummary(sourcePath, id);
  if (fs.existsSync(targetPath)) throw new Error("A board with this name already exists in the destination folder.");
  fs.renameSync(sourcePath, targetPath);
  return boardSummary(targetPath, id);
}

function listBoards(relativeFolderPath = "") {
  return listDirectory(relativeFolderPath);
}

function getRecentBoards() {
  ensureInitialized();
  const settings = readSettings();
  const recentBoards = Array.isArray(settings.recentBoards) ? settings.recentBoards : [];
  return recentBoards.filter((item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.path === "string" && typeof item.kind === "string" && typeof item.lastOpenedAt === "string").slice(0, 8).map((item) => {
    let currentPath = path.resolve(item.path);
    let currentId = item.id;
    let currentName = item.name;
    let exists = fs.existsSync(currentPath);

    if (item.kind === "managed" && isManagedBoardId(item.id)) {
      const resolved = findManagedBoardById(item.id);
      if (resolved) {
        currentPath = resolved;
        currentName = path.basename(resolved, ".excalidraw");
        exists = true;
      }
    }

    return { id: currentId, name: currentName, path: currentPath, kind: item.kind === "managed" ? "managed" : "external", lastOpenedAt: item.lastOpenedAt, exists };
  });
}

function addRecentBoard(id) {
  ensureInitialized();
  const filePath = getBoardFilePath(id);
  if (!fs.existsSync(filePath)) return;
  const external = isExternalBoardId(id);
  const entry = {
    id,
    name: path.basename(filePath, path.extname(filePath)),
    path: path.resolve(filePath),
    kind: external ? "external" : "managed",
    lastOpenedAt: new Date().toISOString(),
  };
  const settings = readSettings();
  const existing = Array.isArray(settings.recentBoards) ? settings.recentBoards : [];
  writeSettings({ ...settings, recentBoards: [entry, ...existing.filter((item) => item && item.id !== id)].slice(0, 8) });
}

function removeRecentBoard(filePath) {
  ensureInitialized();
  const target = path.resolve(filePath);
  const settings = readSettings();
  const existing = Array.isArray(settings.recentBoards) ? settings.recentBoards : [];
  writeSettings({ ...settings, recentBoards: existing.filter((item) => !item || path.resolve(item.path) !== target) });
}

function openExternalBoard(filePath) {
  ensureInitialized();
  if (typeof filePath !== "string" || !filePath.trim()) throw new Error("Invalid external board path.");
  const resolvedPath = path.resolve(filePath);
  if (!resolvedPath.toLowerCase().endsWith(".excalidraw")) throw new Error("Only .excalidraw files can be opened.");
  if (!fs.existsSync(resolvedPath)) throw new Error("The selected file does not exist.");
  const id = getExternalBoardId(resolvedPath);
  loadExternalBoard(resolvedPath);
  return { id, name: path.basename(resolvedPath, ".excalidraw"), path: resolvedPath, kind: "external" };
}

function loadExternalBoard(filePath) {
  try { parseBoardData(fs.readFileSync(filePath, "utf-8")); }
  catch (error) { throw new Error(`Board is corrupted or unreadable: ${error.message}`); }
}

function openRecentBoard(id, filePath, kind) {
  ensureInitialized();
  if (kind === "managed" && isManagedBoardId(id)) {
    const resolved = findManagedBoardById(id);
    if (!resolved) throw new Error("The recent file is no longer available.");
    loadBoard(id);
    return { id, name: path.basename(resolved, ".excalidraw"), path: resolved, kind: "managed" };
  }
  if (typeof filePath !== "string" || !path.isAbsolute(filePath)) throw new Error("Invalid recent board path.");
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) throw new Error("The recent file is no longer available.");
  return openExternalBoard(resolvedPath);
}

function getBoardsFolder() { ensureInitialized(); return boardsDir; }

function setBoardsFolder(folderPath) {
  ensureInitialized();
  if (typeof folderPath !== "string" || !folderPath.trim()) throw new Error("Boards folder must be a non-empty path.");
  const resolved = path.resolve(folderPath);
  fs.mkdirSync(resolved, { recursive: true });
  boardsDir = resolved;
  writeSettings({ ...readSettings(), boardsFolder: resolved });
  return resolved;
}

function getThumbnailKey(boardId) {
  const filePath = getBoardFilePath(boardId);
  const info = getFileInfo(filePath);
  const hash = crypto.createHash("sha256").update(`${path.resolve(filePath)}:${info.mtimeMs}:${info.size}`).digest("hex");
  return { filePath, info, key: hash };
}

function getThumbnail(boardId) {
  try {
    const { key } = getThumbnailKey(boardId);
    const thumbnailPath = path.join(thumbnailDir, `${key}.png`);
    if (!fs.existsSync(thumbnailPath)) return null;
    return `data:image/png;base64,${fs.readFileSync(thumbnailPath).toString("base64")}`;
  } catch { return null; }
}

function saveThumbnail(boardId, dataUrl) {
  const { key } = getThumbnailKey(boardId);
  const prefix = "data:image/png;base64,";
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(prefix)) throw new Error("Invalid thumbnail data.");
  const thumbnailPath = path.join(thumbnailDir, `${key}.png`);
  fs.writeFileSync(thumbnailPath, Buffer.from(dataUrl.slice(prefix.length), "base64"));
  return thumbnailPath;
}

module.exports = {
  initializeStorage,
  getBoardsFolder,
  setBoardsFolder,
  createBoard,
  duplicateBoard,
  saveBoard,
  loadBoard,
  openExternalBoard,
  getRecentBoards,
  addRecentBoard,
  removeRecentBoard,
  openRecentBoard,
  deleteBoard,
  renameBoard,
  listBoards,
  createFolder,
  listAllFolders,
  moveBoard,
  getThumbnail,
  saveThumbnail,
  isManagedBoardId,
};
