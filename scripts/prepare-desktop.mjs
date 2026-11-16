import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const serverEntry = path.join(standalone, "server.js");
const nextStatic = path.join(root, ".next", "static");
const staging = path.join(root, "desktop-resources");
const stagedServer = path.join(staging, "server");

if (!fs.existsSync(serverEntry)) {
  console.error(
    "No standalone server found. Run `npm run build` before preparing the desktop app.",
  );
  process.exit(1);
}

if (fs.existsSync(nextStatic)) {
  const destination = path.join(standalone, ".next", "static");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(nextStatic, destination, { recursive: true });
}

const publicDir = path.join(root, "public");
if (fs.existsSync(publicDir)) {
  const destination = path.join(standalone, "public");
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(publicDir, destination, { recursive: true });
}

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

// Next's file tracing can copy the workspace SQLite file into the standalone
// output. Never ship private writing in the installer: the desktop app creates
// its own database in the user's app-data directory on first launch.
for (const candidate of [
  path.join(standalone, "data"),
  path.join(staging, "data"),
]) {
  fs.rmSync(candidate, { recursive: true, force: true });
}

// Stage the server under a parent directory. electron-builder always filters
// a root-level node_modules from extraResources, even when it is copied
// explicitly. Dereference symlinks so the Windows package contains real files.
fs.cpSync(standalone, stagedServer, {
  recursive: true,
  dereference: true,
  verbatimSymlinks: false,
});

// cpSync can preserve symlinks even with dereference enabled. Replace every
// symlink in the staged tree with a real copy so the app never points back
// at the build directory, and so Windows packaging cannot produce a dangling
// junction.
function materializeSymlinks(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    const stat = fs.lstatSync(full);

    if (stat.isSymbolicLink()) {
      const resolved = fs.realpathSync(full);
      const target = fs.statSync(resolved);
      try {
        fs.unlinkSync(full);
      } catch {
        fs.rmSync(full, { recursive: true, force: true });
      }
      if (target.isDirectory()) {
        fs.cpSync(resolved, full, { recursive: true, dereference: true });
        materializeSymlinks(full);
      } else {
        fs.copyFileSync(resolved, full);
      }
    } else if (stat.isDirectory()) {
      materializeSymlinks(full);
    }
  }
}

materializeSymlinks(stagedServer);

function findPrivateDatabases(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...findPrivateDatabases(full));
    } else if (/\.(db|sqlite|sqlite3)(-(wal|shm))?$/i.test(entry.name)) {
      found.push(full);
    }
  }
  return found;
}

const leaked = findPrivateDatabases(stagedServer);
if (leaked.length > 0) {
  console.error(
    "Refusing to package private database files:\n" +
      leaked.map((file) => `  ${file}`).join("\n"),
  );
  process.exit(1);
}

const nodeName = process.platform === "win32" ? "node.exe" : "node";
const target = path.join(staging, nodeName);
fs.copyFileSync(process.execPath, target);
if (process.platform !== "win32") fs.chmodSync(target, 0o755);

const sizeMb = (file) =>
  `${(fs.statSync(file).size / 1024 / 1024).toFixed(1)} MB`;

console.log("Desktop runtime prepared.");
console.log(`  server: ${path.join(stagedServer, "server.js")}`);
console.log(`  node:   ${target} (${sizeMb(target)})`);
if (fs.existsSync(path.join(stagedServer, ".next", "static"))) {
  console.log("  static: copied");
}
