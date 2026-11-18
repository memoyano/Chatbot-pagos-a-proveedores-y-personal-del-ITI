const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const roots = ["index.js", "src", "scripts", "test"];
const files = [];

function walk(target) {
  const full = path.resolve(target);
  if (!fs.existsSync(full)) return;
  const stat = fs.statSync(full);
  if (stat.isFile() && full.endsWith(".js")) return files.push(full);
  if (!stat.isDirectory()) return;
  for (const item of fs.readdirSync(full)) walk(path.join(full, item));
}

for (const root of roots) walk(root);

let failed = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed++;
    process.stderr.write(result.stderr || result.stdout);
  }
}

if (failed) {
  console.error(`Syntax check falló en ${failed} archivo(s).`);
  process.exit(1);
}
console.log(`Syntax check OK: ${files.length} archivos JavaScript.`);
