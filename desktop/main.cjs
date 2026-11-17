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
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");

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
const setupStatePath = path.join(dataDir, "setup.json");

const OLLAMA_URL = "http://127.0.0.1:11434";
const OLLAMA_WINDOWS_INSTALLER = "https://ollama.com/download/OllamaSetup.exe";
const MODEL_NAME = /^[a-zA-Z0-9._:/-]+$/;

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

function installedOllamaBinary() {
  return (
    ollamaCandidates().find(
      (candidate) => candidate !== "ollama" && fs.existsSync(candidate),
    ) ?? null
  );
}

function findOllama() {
  return installedOllamaBinary() ?? "ollama";
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

async function ollamaReachable(timeoutMs = 1500) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/version`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function ollamaModels() {
  const response = await fetch(`${OLLAMA_URL}/api/tags`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Ollama answered HTTP ${response.status}.`);
  const data = await response.json();
  const models = Array.isArray(data?.models) ? data.models : [];
  return models
    .map((model) => model?.name || model?.model || "")
    .filter(Boolean);
}

async function ollamaInstalled() {
  if (installedOllamaBinary()) return true;
  try {
    const result = await runOllama(["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * Start Ollama if it is installed but not answering. On Windows the tray app
 * is preferred: it runs the server and starts again at sign-in.
 */
async function startOllama() {
  if (await ollamaReachable()) return { ok: true, message: "Ollama is running." };

  const binary = findOllama();
  const trayApp =
    process.platform === "win32" && binary !== "ollama"
      ? path.join(path.dirname(binary), "ollama app.exe")
      : null;
  const useTray = Boolean(trayApp && fs.existsSync(trayApp));

  try {
    const child = spawn(useTray ? trayApp : binary, useTray ? [] : ["serve"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.on("error", () => undefined);
    child.unref();
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Ollama did not start.",
    };
  }

  for (let attempt = 0; attempt < 60; attempt += 1) {
    await delay(500);
    if (await ollamaReachable()) {
      return { ok: true, message: "Ollama is running." };
    }
  }
  return {
    ok: false,
    message:
      "Ollama is installed but did not start. Open Ollama from the Start menu, then press Retry.",
  };
}

/** Refuse to run a downloaded installer unless Windows says Ollama signed it. */
function verifyOllamaSignature(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "$s = Get-AuthenticodeSignature -LiteralPath $env:MAYA_VERIFY_FILE; " +
          "Write-Output \"$($s.Status)|$($s.SignerCertificate.Subject)\"",
      ],
      {
        env: { ...process.env, MAYA_VERIFY_FILE: file },
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.on("error", () =>
      reject(new Error("Windows could not check the installer's signature.")),
    );
    child.on("close", () => {
      const [status = "", subject = ""] = stdout.trim().split("|");
      if (status === "Valid" && /ollama/i.test(subject)) resolve();
      else
        reject(
          new Error(
            "The downloaded Ollama installer is not signed by Ollama, so Maya did not run it.",
          ),
        );
    });
  });
}

function throttle(send, ms = 200) {
  let last = 0;
  return (payload, force = false) => {
    const now = Date.now();
    if (!force && now - last < ms) return;
    last = now;
    send(payload);
  };
}

let ollamaInstalling = false;

async function installOllama(sender) {
  if (process.platform !== "win32") {
    return {
      ok: false,
      message:
        "Automatic install is available on Windows. Download Ollama from ollama.com, then press Retry.",
    };
  }
  if (ollamaInstalling) {
    return { ok: false, message: "Ollama is already being installed." };
  }

  ollamaInstalling = true;
  const progress = throttle((payload) =>
    sender.send("maya:install-progress", payload),
  );
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "maya-ollama-"));
  const installer = path.join(workDir, "OllamaSetup.exe");

  try {
    progress({ stage: "download", percent: 0 }, true);
    const response = await fetch(OLLAMA_WINDOWS_INSTALLER, {
      redirect: "follow",
    });
    if (!response.ok || !response.body) {
      throw new Error(
        `Could not download Ollama (HTTP ${response.status}). Check your internet connection.`,
      );
    }
    const total = Number(response.headers.get("content-length")) || 0;
    let received = 0;
    const counter = new Transform({
      transform(chunk, _encoding, callback) {
        received += chunk.length;
        progress({
          stage: "download",
          percent: total ? Math.floor((received / total) * 100) : null,
          receivedMB: Math.round(received / 1024 / 1024),
          totalMB: total ? Math.round(total / 1024 / 1024) : null,
        });
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      counter,
      fs.createWriteStream(installer),
    );

    progress({ stage: "verify", percent: null }, true);
    await verifyOllamaSignature(installer);

    progress({ stage: "install", percent: null }, true);
    const code = await new Promise((resolve, reject) => {
      const child = spawn(
        installer,
        ["/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/SP-"],
        { windowsHide: true, stdio: "ignore" },
      );
      child.on("error", reject);
      child.on("close", resolve);
    });
    if (code !== 0) {
      throw new Error(`The Ollama installer stopped with code ${code}.`);
    }
    if (!installedOllamaBinary()) {
      throw new Error("Ollama installed, but Maya could not find ollama.exe.");
    }
    return { ok: true, message: "Ollama is installed." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Ollama could not be installed.",
    };
  } finally {
    ollamaInstalling = false;
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

/** Pull through Ollama's HTTP API so progress is measured in bytes. */
async function pullModel(sender, model) {
  if (typeof model !== "string" || !MODEL_NAME.test(model)) {
    return { ok: false, message: "Invalid model name." };
  }

  const progress = throttle((payload) =>
    sender.send("maya:ollama-progress", payload),
  );
  const layers = new Map();
  let lastError = "";

  const handle = (raw) => {
    const line = raw.trim();
    if (!line) return;
    let data;
    try {
      data = JSON.parse(line);
    } catch {
      return;
    }
    if (data.error) {
      lastError = String(data.error);
      return;
    }
    if (data.digest && data.total) {
      layers.set(data.digest, {
        total: data.total,
        completed: data.completed ?? 0,
      });
    }
    let total = 0;
    let completed = 0;
    for (const layer of layers.values()) {
      total += layer.total;
      completed += layer.completed;
    }
    const percent = total ? Math.floor((completed / total) * 100) : null;
    progress(
      {
        model,
        status: String(data.status ?? ""),
        percent,
        line: percent === null ? String(data.status ?? "") : `${percent}%`,
      },
      data.status === "success",
    );
  };

  try {
    const response = await fetch(`${OLLAMA_URL}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model, stream: true }),
    });
    if (!response.ok || !response.body) {
      return {
        ok: false,
        message: `Ollama could not start the download (HTTP ${response.status}).`,
      };
    }
    const decoder = new TextDecoder();
    let buffer = "";
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        handle(buffer.slice(0, newline));
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
      }
    }
    handle(buffer + decoder.decode());
    if (lastError) return { ok: false, message: lastError };
    return { ok: true, message: `${model} is ready.` };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && /fetch failed|ECONNREFUSED/i.test(error.message)
          ? "Ollama is not running. Press Retry to start it."
          : error instanceof Error
            ? error.message
            : "The download failed.",
    };
  }
}

function readSetupState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(setupStatePath, "utf8"));
    return { completed: Boolean(parsed?.completed), mode: parsed?.mode ?? null };
  } catch {
    return { completed: false, mode: null };
  }
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
    const canInstall = process.platform === "win32";
    if (await ollamaReachable()) {
      try {
        return {
          installed: true,
          running: true,
          canInstall,
          models: await ollamaModels(),
        };
      } catch (error) {
        return {
          installed: true,
          running: true,
          canInstall,
          models: [],
          error: error instanceof Error ? error.message : undefined,
        };
      }
    }
    const installed = await ollamaInstalled();
    return {
      installed,
      running: false,
      canInstall,
      models: [],
      error: installed
        ? "Ollama is installed but its local server is not running."
        : "Ollama is not installed.",
    };
  });

  ipcMain.handle("maya:ollama-install", (event) => installOllama(event.sender));
  ipcMain.handle("maya:ollama-start", () => startOllama());
  ipcMain.handle("maya:ollama-pull", (event, model) =>
    pullModel(event.sender, model),
  );

  ipcMain.handle("maya:setup-state", () => readSetupState());
  ipcMain.handle("maya:setup-complete", (_event, mode) => {
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(
      setupStatePath,
      JSON.stringify({
        completed: true,
        mode: ["local", "api", "skipped"].includes(mode) ? mode : "skipped",
        at: new Date().toISOString(),
      }),
    );
    return true;
  });
  ipcMain.handle("maya:setup-reset", () => {
    fs.rmSync(setupStatePath, { force: true });
    return true;
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
