const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function listMigrationFiles(dir) {
  return fs.readdirSync(dir)
    .filter((name) => /^\d{12,}-.*\.js$/.test(name))
    .sort();
}

function checksumFor(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function migrationNameFromFile(file) {
  return path.basename(file).replace(/\.js$/, "");
}

module.exports = { listMigrationFiles, checksumFor, migrationNameFromFile };
