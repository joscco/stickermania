import {app, BrowserWindow, dialog, shell} from "electron";
import {spawn} from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import {fileURLToPath} from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PORT = 3001;

let mainWindow = null;
let backendProcess = null;
let backendBaseUrl = null;

app.setName("stickermania");
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("disable-background-timer-throttling");
app.commandLine.appendSwitch("disable-renderer-backgrounding");

const singleInstanceLock = app.requestSingleInstanceLock();
if (!singleInstanceLock) {
  app.quit();
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  mainWindow.focus();
});

app.whenReady().then(async () => {
  try {
    logGpuStatus();
    const paths = resolveRuntimePaths();
    ensureBuiltAssets(paths);
    const port = await findAvailablePort(DEFAULT_PORT);
    backendBaseUrl = `http://127.0.0.1:${port}`;
    backendProcess = startBackend({paths, port});
    createMainWindow(createLoadingUrl(paths));
    await waitForServer(`${backendBaseUrl}/api/info`, 20000);
    await mainWindow.loadURL(backendBaseUrl);
  } catch (error) {
    await dialog.showMessageBox({
      type: "error",
      title: "stickermania Host konnte nicht starten",
      message: "Der lokale stickermania-Server konnte nicht gestartet werden.",
      detail: error instanceof Error ? error.message : String(error),
    });
    app.quit();
  }
});

app.on("before-quit", () => {
  stopBackend();
});

app.on("window-all-closed", () => {
  app.quit();
});

function resolveRuntimePaths() {
  if (app.isPackaged) {
    return {
      backendEntry: path.join(app.getAppPath(), "backend", "index.js"),
      frontendDist: path.join(process.resourcesPath, "frontend"),
      dataRoot: path.join(app.getPath("userData"), "data"),
      cwd: process.resourcesPath,
    };
  }

  const repoRoot = path.resolve(__dirname, "../..");
  const frontendBrowserDist = path.join(repoRoot, "apps/frontend/dist/frontend/browser");
  const frontendDist = fs.existsSync(path.join(frontendBrowserDist, "index.html"))
    ? frontendBrowserDist
    : path.join(repoRoot, "apps/frontend/dist/frontend");

  return {
    backendEntry: path.join(repoRoot, "apps/backend/dist/index.js"),
    frontendDist,
    dataRoot: path.join(app.getPath("userData"), "data"),
    cwd: repoRoot,
  };
}

function logGpuStatus() {
  try {
    console.log("[electron] gpu feature status", app.getGPUFeatureStatus());
  } catch {
    // Best-effort diagnostic only.
  }
}

function ensureBuiltAssets(paths) {
  const missing = [];
  if (!fs.existsSync(paths.backendEntry)) {
    missing.push(paths.backendEntry);
  }
  if (!fs.existsSync(path.join(paths.frontendDist, "index.html"))) {
    missing.push(paths.frontendDist);
  }
  if (missing.length > 0) {
    throw new Error(`Build-Artefakte fehlen:\n${missing.join("\n")}\n\nBitte zuerst npm run _build ausfuehren.`);
  }
}

function startBackend({paths, port}) {
  fs.mkdirSync(paths.dataRoot, {recursive: true});

  const child = spawn(process.execPath, [paths.backendEntry], {
    cwd: paths.cwd,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      APP_MODE: "lan-host",
      SESSION_STORE: "file",
      ASSET_STORE: "local",
      PORT: String(port),
      DATA_ROOT: paths.dataRoot,
      FRONTEND_DIST_PATH: paths.frontendDist,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", chunk => {
    console.log(`[backend] ${chunk.toString().trimEnd()}`);
  });
  child.stderr.on("data", chunk => {
    console.error(`[backend] ${chunk.toString().trimEnd()}`);
  });
  child.on("exit", (code, signal) => {
    if (code === 0 || signal === "SIGTERM" || signal === "SIGINT") {
      return;
    }
    dialog.showMessageBox({
      type: "error",
      title: "stickermania Host wurde beendet",
      message: "Der lokale Server wurde unerwartet beendet.",
      detail: `Exit-Code: ${code ?? "unbekannt"}\nSignal: ${signal ?? "keins"}`,
    }).catch(() => undefined);
  });

  return child;
}

function stopBackend() {
  if (!backendProcess || backendProcess.killed) {
    return;
  }
  backendProcess.kill("SIGTERM");
  backendProcess = null;
}

function createMainWindow(url) {
  if (mainWindow) {
    mainWindow.loadURL(url);
    return;
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: "stickermania",
    backgroundColor: "#f7f2e8",
    icon: resolveWindowIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  mainWindow.removeMenu();
  mainWindow.webContents.setWindowOpenHandler(({url: targetUrl}) => {
    shell.openExternal(targetUrl).catch(() => undefined);
    return {action: "deny"};
  });
  mainWindow.loadURL(url);
}

function createLoadingUrl(paths) {
  const logoDataUrl = readLoadingLogoDataUrl(paths);
  const html = `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>stickermania startet</title>
  <style>
    html, body {
      height: 100%;
      margin: 0;
      background: #f7f2e8;
      color: #2a241f;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }
    body {
      display: grid;
      place-items: center;
    }
    .panel {
      display: grid;
      gap: 20px;
      justify-items: center;
      text-align: center;
    }
    .logo {
      display: block;
      width: min(420px, 72vw);
      height: auto;
      filter: drop-shadow(4px 6px 0 rgba(17, 17, 17, 0.22));
    }
    .title {
      font-size: 20px;
      font-weight: 900;
    }
    .text {
      font-size: 13px;
      font-weight: 700;
      color: #756c63;
    }
  </style>
</head>
<body>
  <main class="panel">
    ${logoDataUrl ? `<img class="logo" src="${logoDataUrl}" alt="stickermania">` : ""}
  </main>
</body>
</html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
}

function readLoadingLogoDataUrl(paths) {
  const logoPath = path.join(paths.frontendDist, "assets", "svg", "logo.svg");
  if (!fs.existsSync(logoPath)) {
    return null;
  }

  return `data:image/svg+xml;base64,${fs.readFileSync(logoPath).toString("base64")}`;
}

function resolveWindowIconPath() {
  const iconPath = path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png");
  return fs.existsSync(iconPath) ? iconPath : undefined;
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const tryPort = port => {
      const server = net.createServer();
      server.once("error", error => {
        if (error && error.code === "EADDRINUSE" && port < startPort + 50) {
          tryPort(port + 1);
          return;
        }
        reject(error);
      });
      server.once("listening", () => {
        server.close(() => resolve(port));
      });
      server.listen(port, "127.0.0.1");
    };
    tryPort(startPort);
  });
}

function waitForServer(url, timeoutMs) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const poll = () => {
      const request = http.get(url, response => {
        response.resume();
        if ((response.statusCode ?? 0) >= 200 && (response.statusCode ?? 0) < 500) {
          resolve();
          return;
        }
        retry();
      });
      request.on("error", retry);
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };

    const retry = () => {
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error(`Server antwortet nicht unter ${url}.`));
        return;
      }
      setTimeout(poll, 250);
    };

    poll();
  });
}
