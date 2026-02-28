import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import mime from "mime";
import {
  type ClientToServerMessage,
  type ServerToClientMessage,
  type WorldState,
  toCellKey,
  clampInt
} from "@birthday/shared";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT: number = Number.parseInt(process.env.PORT ?? "3001", 10) || 3001;
const GRID_WIDTH: number = Number.parseInt(process.env.GRID_WIDTH ?? "30", 10) || 30;
const GRID_HEIGHT: number = Number.parseInt(process.env.GRID_HEIGHT ?? "20", 10) || 20;

const PERSIST_PATH: string = process.env.PERSIST_PATH ?? path.resolve(process.cwd(), "world-state.json");

function createEmptyWorld(): WorldState {
  return {
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    cells: {},
    revision: 0,
    updatedAt: Date.now()
  };
}

function loadWorldFromDisk(): WorldState {
  try {
    if (!fs.existsSync(PERSIST_PATH)) {
      return createEmptyWorld();
    }
    const raw: string = fs.readFileSync(PERSIST_PATH, "utf-8");
    const parsed: unknown = JSON.parse(raw);
    // minimal validation
    if (typeof parsed !== "object" || parsed === null) {
      return createEmptyWorld();
    }
    const maybeState: any = parsed;
    if (typeof maybeState.width !== "number" || typeof maybeState.height !== "number") {
      return createEmptyWorld();
    }
    if (typeof maybeState.cells !== "object" || maybeState.cells === null) {
      return createEmptyWorld();
    }
    return {
      width: maybeState.width,
      height: maybeState.height,
      cells: maybeState.cells,
      revision: typeof maybeState.revision === "number" ? maybeState.revision : 0,
      updatedAt: typeof maybeState.updatedAt === "number" ? maybeState.updatedAt : Date.now()
    };
  } catch {
    return createEmptyWorld();
  }
}

function saveWorldToDisk(worldState: WorldState): void {
  try {
    fs.writeFileSync(PERSIST_PATH, JSON.stringify(worldState, null, 2), "utf-8");
  } catch {
    // ignore persistence errors for party mode
  }
}

let worldState: WorldState = loadWorldFromDisk();

function bumpWorldRevision(): void {
  worldState.revision = worldState.revision + 1;
  worldState.updatedAt = Date.now();
}

function broadcastState(wss: WebSocketServer): void {
  const message: ServerToClientMessage = { type: "state", state: worldState };
  const payload: string = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function send(ws: WebSocket, message: ServerToClientMessage): void {
  ws.send(JSON.stringify(message));
}

function isValidMessage(message: any): message is ClientToServerMessage {
  return typeof message === "object" && message !== null && typeof message.type === "string";
}

function serveStatic(request: http.IncomingMessage, response: http.ServerResponse): void {
  const url: string = request.url ?? "/";
  // Serve built frontend from apps/frontend/dist when started with --serve-static
  const distRoot: string = path.resolve(process.cwd(), "apps/frontend/dist");
  const cleanPath: string = url.split("?")[0] ?? "/";
  const requestedPath: string = cleanPath === "/" ? "/index.html" : cleanPath;

  // For hash routing (/#/player), the browser asks for "/" anyway.
  // But if someone refreshes on "/assets/...", we want to serve it.
  const filePath: string = path.resolve(distRoot, "." + requestedPath);

  // Prevent path traversal
  if (!filePath.startsWith(distRoot)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      // Fallback to index.html for SPA routes
      const indexPath: string = path.resolve(distRoot, "index.html");
      const html: Buffer = fs.readFileSync(indexPath);
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(html);
      return;
    }

    const file: Buffer = fs.readFileSync(filePath);
    const contentType: string = mime.getType(filePath) ?? "application/octet-stream";
    response.writeHead(200, { "Content-Type": contentType });
    response.end(file);
  } catch {
    response.writeHead(500);
    response.end("Internal Server Error");
  }
}

const shouldServeStatic: boolean = process.argv.includes("--serve-static");

const server = http.createServer((req, res) => {
  if (shouldServeStatic) {
    serveStatic(req, res);
    return;
  }

  // Default response in dev mode
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Birthday Sandbox Backend running. WebSocket at /ws");
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (ws) => {
  const clientId: string = crypto.randomUUID?.() ?? Math.random().toString(16).slice(2);

  send(ws, { type: "welcome", clientId, serverTime: Date.now() });
  send(ws, { type: "state", state: worldState });

  ws.on("message", (data) => {
    let parsed: any;
    try {
      parsed = JSON.parse(data.toString());
    } catch {
      send(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (!isValidMessage(parsed)) {
      send(ws, { type: "error", message: "Invalid message shape" });
      return;
    }

    switch (parsed.type) {
      case "join": {
        // Nothing special yet
        send(ws, { type: "state", state: worldState });
        return;
      }

      case "ping": {
        const t: number = typeof parsed.t === "number" ? parsed.t : Date.now();
        send(ws, { type: "pong", t, serverTime: Date.now() });
        return;
      }

      case "reset": {
        worldState = createEmptyWorld();
        bumpWorldRevision();
        saveWorldToDisk(worldState);
        broadcastState(wss);
        return;
      }

      case "place": {
        const x: number = clampInt(parsed.x, 0, worldState.width - 1);
        const y: number = clampInt(parsed.y, 0, worldState.height - 1);
        const key = toCellKey(x, y);

        worldState.cells[key] = {
          id: crypto.randomUUID?.() ?? Math.random().toString(16).slice(2),
          type: parsed.objectType,
          level: 1,
          placedAt: Date.now()
        };

        bumpWorldRevision();
        saveWorldToDisk(worldState);
        broadcastState(wss);
        return;
      }

      case "remove": {
        const x: number = clampInt(parsed.x, 0, worldState.width - 1);
        const y: number = clampInt(parsed.y, 0, worldState.height - 1);
        const key = toCellKey(x, y);

        if (worldState.cells[key]) {
          delete worldState.cells[key];
          bumpWorldRevision();
          saveWorldToDisk(worldState);
          broadcastState(wss);
        }
        return;
      }

      default: {
        send(ws, { type: "error", message: "Unknown message type" });
        return;
      }
    }
  });
});

server.listen(DEFAULT_PORT, () => {
  console.log(`[backend] listening on http://localhost:${DEFAULT_PORT}`);
  console.log(`[backend] websocket: ws://localhost:${DEFAULT_PORT}/ws`);
  console.log(`[backend] persist file: ${PERSIST_PATH}`);
  if (shouldServeStatic) {
    console.log(`[backend] serving static frontend from apps/frontend/dist`);
  }
});
