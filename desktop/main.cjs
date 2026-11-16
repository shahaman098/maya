const {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
} = require("electron");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");

const isDev = !app.isPackaged;
const devUrl =
  process.env.MAYA_DESKTOP_DEV_URL || (isDev ? "http://localhost:3000" : "");

let mainWindow = null;
let serverProcess = null;
let serverLog = null;
let appUrl = "";

const dataDir = app.getPath("userData");
const dbPath = path.join(dataDir, "maya.db");
const serverLogPath = path.join(dataDir, "server.log");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function packagedNode() {
  const name = process.platform === "win32" ? "node.exe" : "node";
  return path.join(process.resourcesPath, "app", name);
}

function packagedServer() {
  return path.join(process.resourcesPath, "app", "server", "server.js");
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 160; attempt += 1) {
    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `The local server stopped during startup (exit ${serverProcess.exitCode}).`,
      );
    }
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        cache: "no-store",
      });
      if (response.ok) return;
    } catch {
      // Not listening yet.
    }
    await delay(500);
  }
  throw new Error("The local server did not become ready in 80 seconds.");
}

async function startServer() {
  const serverEntry = app.isPackaged
    ? packagedServer()
    : path.join(__dirname, "..", ".next", "standalone", "server.js");
  const serverDir = path.dirname(serverEntry);
  const nodeBinary = app.isPackaged
    ? packagedNode()
    : process.env.MAYA_NODE_BINARY || "node";

  if (!fs.existsSync(serverEntry)) {
    throw new Error(
      "The packaged server is missing. Run `npm run build` and `npm run desktop:prepare` first.",
    );
  }
  if (app.isPackaged && !fs.existsSync(nodeBinary)) {
    throw new Error("The bundled Node runtime is missing from the app.");
  }

  fs.mkdirSync(dataDir, { recursive: true });
  serverLog = fs.createWriteStream(serverLogPath, { flags: "a" });
  serverLog.write(`\n--- Maya server ${new Date().toISOString()} ---\n`);

  const port = await freePort();
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    HOSTNAME: "127.0.0.1",
    PORT: String(port),
    MAYA_DB_PATH: dbPath,
    MAYA_DESKTOP: "1",
  };

  serverProcess = spawn(nodeBinary, [serverEntry], {
    cwd: serverDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });

  serverProcess.stdout.pipe(serverLog, { end: false });
  serverProcess.stderr.pipe(serverLog, { end: false });
  serverProcess.on("exit", (code) => {
    serverLog?.write(`\n--- server exited ${code} ---\n`);
  });

  appUrl = `http://127.0.0.1:${port}`;
  await waitForHealth(appUrl);
  return appUrl;
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 700,
    show: false,
    title: "Maya",
    backgroundColor: "#f5f0e6",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, target) => {
    if (target.startsWith(url)) return;
    event.preventDefault();
    if (/^https?:\/\//i.test(target)) void shell.openExternal(target);
  });

  mainWindow.webContents.on(
    "did-fail-load",
    (_event, errorCode, errorDescription) => {
      if (errorCode === -3) return;
      dialog.showErrorBox(
        "Maya could not load",
        `The window could not reach the local app.\n\n${errorDescription}\n\nLog: ${serverLogPath}`,
      );
    },
  );

  void mainWindow.loadURL(url);
}

function ollamaCandidates() {
  const candidates = [];
  if (process.platform === "win32") {
    if (process.env.LOCALAPPDATA) {
      candidates.push(
        path.join(
          process.env.LOCALAPPDATA,
          "Programs",
          "Ollama",
          "ollama.exe",
        ),
      );
    }
    if (process.env.ProgramFiles) {
      candidates.push(path.join(process.env.ProgramFiles, "Ollama", "ollama.exe"));
    }
  } else {
    candidates.push("/opt/homebrew/bin/ollama", "/usr/local/bin/ollama");
  }
  candidates.push("ollama");
  return [...new Set(candidates)];
}

function findOllama() {
  return (
    ollamaCandidates().find(
      (candidate) => candidate === "ollama" || fs.existsSync(candidate),
    ) ?? "ollama"
  );
}

function runOllama(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(findOllama(), args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

function parseModels(output) {
  return [
    ...new Set(
      output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line && !/^name\s+/i.test(line))
        .map((line) => line.split(/\s+/)[0])
        .filter(Boolean),
    ),
  ];
}

function registerIpc() {
  ipcMain.handle("maya:hardware", async () => {
    let gpu = "";
    try {
      const info = await app.getGPUInfo("basic");
      const devices = Array.isArray(info.gpuDevice) ? info.gpuDevice : [];
      gpu = devices
        .map((device) => device.deviceString || device.driverVendor || "")
        .filter(Boolean)
        .join(", ");
    } catch {
      // GPU details are optional.
    }

    return {
      totalMemGB: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
      cpu: os.cpus()[0]?.model ?? "",
      gpu,
      platform: process.platform,
      isWindows: process.platform === "win32",
    };
  });

  ipcMain.handle("maya:ollama-check", async () => {
    try {
      const result = await runOllama(["list"]);
      if (result.code === 0) {
        return {
          installed: true,
          running: true,
          models: parseModels(result.stdout),
        };
      }
      return {
        installed: true,
        running: false,
        models: [],
        error:
          result.stderr.trim() ||
          "Ollama is installed but its local server is not responding.",
      };
    } catch (error) {
      return {
        installed: false,
        running: false,
        models: [],
        error:
          error instanceof Error
            ? error.message
            : "Ollama was not found on this machine.",
      };
    }
  });

  ipcMain.handle("maya:ollama-pull", (event, model) => {
    if (typeof model !== "string" || !/^[a-zA-Z0-9._:/_-]+$/.test(model)) {
      return { ok: false, message: "Invalid model name." };
    }

    return new Promise((resolve) => {
      const child = spawn(findOllama(), ["pull", model], {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const send = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
          if (line.trim()) {
            event.sender.send("maya:ollama-progress", {
              model,
              line: line.trim(),
            });
          }
        }
      };
      child.stdout.on("data", send);
      child.stderr.on("data", send);
      child.on("error", (error) => {
        resolve({
          ok: false,
          message: error.message.includes("ENOENT")
            ? "Ollama is not installed."
            : error.message,
        });
      });
      child.on("close", (code) => {
        resolve({
          ok: code === 0,
          message:
            code === 0
              ? `${model} is ready.`
              : `Ollama exited with code ${code}. Check the Ollama window.`,
        });
      });
    });
  });

  ipcMain.handle("maya:open-external", async (_event, target) => {
    if (typeof target === "string" && /^https?:\/\//i.test(target)) {
      await shell.openExternal(target);
      return true;
    }
    return false;
  });

  ipcMain.handle("maya:data-path", () => dbPath);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(async () => {
    app.setAppUserModelId("com.maya.voice");
    if (process.platform !== "darwin") Menu.setApplicationMenu(null);
    registerIpc();

    try {
      const url = devUrl || (await startServer());
      appUrl = url;
      createWindow(url);
    } catch (error) {
      dialog.showErrorBox(
        "Maya could not start",
        `${error instanceof Error ? error.message : "Unknown startup error."}\n\nLog: ${serverLogPath}`,
      );
      app.quit();
    }
  });

  app.on("activate", () => {
    if (!mainWindow && appUrl) createWindow(appUrl);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    if (serverProcess && serverProcess.exitCode === null) {
      serverProcess.kill();
    }
    serverLog?.end();
    serverProcess = null;
  });
}
