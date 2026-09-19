const fs = require("fs");
const path = require("path");
const os = require("os");

const boardsDir = path.join(
  os.homedir(),
  "Documents",
  "Excalidraw Custom",
  "boards",
);

function ensureBoardsDirectory() {
  fs.mkdirSync(boardsDir, { recursive: true });
}

function getBoardPath(id) {
  return path.join(boardsDir, `${id}.excalidraw`);
}

function saveBoard(id, data) {
  ensureBoardsDirectory();

  const filePath = getBoardPath(id);

  fs.writeFileSync(filePath, data, "utf-8");

  return filePath;
}

function loadBoard(id) {
  const filePath = getBoardPath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Board not found: ${id}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function deleteBoard(id) {
  const filePath = getBoardPath(id);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

function listBoards() {
  ensureBoardsDirectory();

  return fs
    .readdirSync(boardsDir)
    .filter((file) => file.endsWith(".excalidraw"))
    .map((file) => {
      const id = path.basename(file, ".excalidraw");
      const filePath = getBoardPath(id);
      const stats = fs.statSync(filePath);

      return {
        id,
        name: id,
        updatedAt: stats.mtime.toISOString(),
      };
    });
}

module.exports = {
  saveBoard,
  loadBoard,
  deleteBoard,
  listBoards,
};
