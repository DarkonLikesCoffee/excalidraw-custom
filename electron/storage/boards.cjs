const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

let boardsDir = null;

function initializeStorage(userDataPath) {
  boardsDir = path.join(userDataPath, "boards");
  fs.mkdirSync(boardsDir, { recursive: true });
}

function ensureInitialized() {
  if (!boardsDir) {
    throw new Error("Board storage has not been initialized.");
  }
}

function validateBoardId(id) {
  if (typeof id !== "string") {
    throw new Error("Board ID must be a string.");
  }

  if (!id.trim()) {
    throw new Error("Board ID cannot be empty.");
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

  return trimmed;
}

function getBoardPath(id) {
  ensureInitialized();

  const safeId = validateBoardId(id);
  const filePath = path.join(boardsDir, `${safeId}.excalidraw`);

  const resolvedBoardsDir = path.resolve(boardsDir);
  const resolvedFilePath = path.resolve(filePath);

  if (
    !resolvedFilePath.startsWith(`${resolvedBoardsDir}${path.sep}`)
  ) {
    throw new Error("Invalid board path.");
  }

  return filePath;
}

function generateBoardId() {
  return crypto.randomUUID();
}

function validateBoardData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Board data must be an object.");
  }

  if (!Array.isArray(data.elements)) {
    throw new Error("Board data is missing a valid elements array.");
  }

  if (!data.appState || typeof data.appState !== "object") {
    throw new Error("Board data is missing a valid appState.");
  }

  if (
    data.board &&
    typeof data.board === "object" &&
    typeof data.board.id === "string" &&
    typeof data.board.name === "string"
  ) {
    return data;
  }

  return data;
}

function writeBoardFile(filePath, data) {
  const serialized = JSON.stringify(data, null, 2);
  const tempPath = `${filePath}.tmp`;

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

function createBoard(name) {
  ensureInitialized();

  const boardName = validateBoardName(name);
  const id = generateBoardId();

  const data = {
    type: "excalidraw",
    version: 2,
    source: "excalidraw-custom",
    elements: [],
    appState: {},
    files: {},
    board: {
      id,
      name: boardName,
    },
  };

  const filePath = getBoardPath(id);

  writeBoardFile(filePath, data);

  return {
    id,
    name: boardName,
    updatedAt: new Date().toISOString(),
  };
}

function saveBoard(id, data) {
  const filePath = getBoardPath(id);

  const parsedData =
    typeof data === "string" ? JSON.parse(data) : data;

  const validatedData = validateBoardData(parsedData);

  const existingBoard = (() => {
    try {
      if (!fs.existsSync(filePath)) {
        return null;
      }

      return JSON.parse(fs.readFileSync(filePath, "utf-8")).board;
    } catch {
      return null;
    }
  })();

  const boardName =
    existingBoard?.name ||
    validatedData.board?.name ||
    id;

  const finalData = {
    ...validatedData,
    board: {
      id,
      name: boardName,
    },
  };

  writeBoardFile(filePath, finalData);

  return filePath;
}

function loadBoard(id) {
  const filePath = getBoardPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Board not found: ${id}`);
  }

  let parsedData;

  try {
    parsedData = JSON.parse(
      fs.readFileSync(filePath, "utf-8"),
    );
  } catch (error) {
    throw new Error(
      `Board "${id}" is corrupted or unreadable: ${error.message}`,
    );
  }

  return validateBoardData(parsedData);
}

function deleteBoard(id) {
  const filePath = getBoardPath(id);

  if (!fs.existsSync(filePath)) {
    return;
  }

  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    throw new Error(
      `Failed to delete board "${id}": ${error.message}`,
    );
  }
}

function renameBoard(id, newName) {
  const filePath = getBoardPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Board not found: ${id}`);
  }

  const boardName = validateBoardName(newName);

  let data;

  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch (error) {
    throw new Error(
      `Board "${id}" is corrupted or unreadable: ${error.message}`,
    );
  }

  data.board = {
    id,
    name: boardName,
  };

  writeBoardFile(filePath, data);

  return {
    id,
    name: boardName,
  };
}

function listBoards() {
  ensureInitialized();

  const files = fs
    .readdirSync(boardsDir)
    .filter((file) => file.endsWith(".excalidraw"));

  return files.map((file) => {
    const id = path.basename(file, ".excalidraw");
    const filePath = getBoardPath(id);
    const stats = fs.statSync(filePath);

    let name = id;

    try {
      const data = JSON.parse(
        fs.readFileSync(filePath, "utf-8"),
      );

      if (
        data.board &&
        typeof data.board.name === "string"
      ) {
        name = data.board.name;
      }
    } catch {
      // Keep filename as fallback.
    }

    return {
      id,
      name,
      updatedAt: stats.mtime.toISOString(),
    };
  });
}

module.exports = {
  initializeStorage,
  createBoard,
  saveBoard,
  loadBoard,
  deleteBoard,
  renameBoard,
  listBoards,
};