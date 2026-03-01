import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { loadBackendConfig } from "./config.js";
import { serveStatic } from "./http/static.js";
import { GameStore } from "./game/challengeStore.js";
import { SaveScheduler } from "./game/saveScheduler.js";
import { loadGameFromDisk, saveGameToDisk } from "./world/persistence.js";
import type { ClientToServerMessage, ServerToClientMessage, GameState } from "@birthday/shared";

// ══════════════════════════════════════════════════════
//  Bootstrap
// ══════════════════════════════════════════════════════

const backendConfig = loadBackendConfig({ argv: process.argv, cwd: process.cwd() });

const initialGameState: GameState = loadGameFromDisk({
  persistPath: backendConfig.persistPath,
  createEmpty: () => GameStore.createEmpty()
});

const gameStore = new GameStore({ initial: initialGameState });

const saveScheduler = new SaveScheduler({
  debounceMs: 400,
  saveFn: () => {
    saveGameToDisk({ persistPath: backendConfig.persistPath, state: gameStore.getState() });
  }
});

// ══════════════════════════════════════════════════════
//  Track connected clients
// ══════════════════════════════════════════════════════

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  kind: "player" | "board";
  playerId: string;
}

const clients = new Map<string, ConnectedClient>();

function broadcast(message: ServerToClientMessage): void {
  const json = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(json);
    }
  }
}

function broadcastState(): void {
  broadcast({ type: "state", state: gameStore.getState() });
}

function sendTo(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// ══════════════════════════════════════════════════════
//  HTTP server
// ══════════════════════════════════════════════════════

function resolveFrontendDistRootAbsolutePath(): string {
  const firstCandidate: string = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
  const secondCandidate: string = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");

  if (fs.existsSync(path.resolve(firstCandidate, "index.html"))) return firstCandidate;
  if (fs.existsSync(path.resolve(secondCandidate, "index.html"))) return secondCandidate;

  return firstCandidate;
}

const server = http.createServer((request, response) => {
  // --- API: info ---
  if (request.url?.startsWith("/api/info") && request.method === "GET") {
    const hostHeader: string = String(request.headers.host ?? "");
    const baseUrl: string = `http://${hostHeader}`;

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({
      baseUrl,
      fieldWidth: backendConfig.fieldWidth,
      fieldHeight: backendConfig.fieldHeight
    }));
    return;
  }

  // --- API: state (for initial board load / polling fallback) ---
  if (request.url?.startsWith("/api/state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRevisionRaw: string | null = url.searchParams.get("sinceRevision");
    const sinceRevision: number = sinceRevisionRaw ? Number(sinceRevisionRaw) : -1;

    const state: GameState = gameStore.getState();

    if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state));
    return;
  }

  // --- API: reset ---
  if (request.url?.startsWith("/api/reset") && request.method === "POST") {
    gameStore.reset();
    saveScheduler.schedule();
    broadcastState();

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- Static frontend ---
  if (backendConfig.shouldServeStatic) {
    const distRootAbsolutePath: string = resolveFrontendDistRootAbsolutePath();
    serveStatic({ request, response, distRootAbsolutePath });
    return;
  }

  // --- Fallback ---
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Draw & Search Backend running. WebSocket at /ws");
});

// ══════════════════════════════════════════════════════
//  WebSocket server
// ══════════════════════════════════════════════════════

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws" || request.url?.startsWith("/ws?")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws: WebSocket) => {
  let clientId: string | null = null;

  ws.on("message", (rawData) => {
    let msg: ClientToServerMessage;
    try {
      msg = JSON.parse(String(rawData));
    } catch {
      sendTo(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    // ──── join ────
    if (msg.type === "join") {
      clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const player = gameStore.joinPlayer({
        clientId,
        kind: msg.kind,
        existingPlayerId: msg.playerId
      });

      clients.set(clientId, { ws, clientId, kind: msg.kind, playerId: player.id });

      sendTo(ws, { type: "welcome", clientId, playerId: player.id, serverTime: Date.now() });
      sendTo(ws, { type: "state", state: gameStore.getState() });

      if (msg.kind === "player" && player.name.length > 0) {
        broadcast({ type: "event", text: `${player.name} ist beigetreten! 🎉`, createdAt: Date.now() });
      }

      saveScheduler.schedule();
      return;
    }

    if (!clientId) {
      sendTo(ws, { type: "error", message: "Not joined yet" });
      return;
    }

    const session = gameStore.getSession(clientId);
    if (!session) {
      sendTo(ws, { type: "error", message: "Session not found" });
      return;
    }

    // ──── set-name ────
    if (msg.type === "set-name") {
      const name = (msg.name ?? "").trim().slice(0, 24);
      if (name.length === 0) {
        sendTo(ws, { type: "error", message: "Name darf nicht leer sein" });
        return;
      }
      gameStore.setPlayerName(session.playerId, name);
      saveScheduler.schedule();
      broadcastState();
      broadcast({ type: "event", text: `${name} ist beigetreten! 🎉`, createdAt: Date.now() });
      return;
    }

    // ──── submit-avatar ────
    if (msg.type === "submit-avatar") {
      if (!msg.avatarDataUrl || msg.avatarDataUrl.length > 200_000) {
        sendTo(ws, { type: "error", message: "Avatar too large" });
        return;
      }
      gameStore.setPlayerAvatar(session.playerId, msg.avatarDataUrl);
      saveScheduler.schedule();
      broadcastState();
      return;
    }

    // ──── request-task ────
    if (msg.type === "request-task") {
      const task = gameStore.assignTask(clientId);
      if (task) {
        sendTo(ws, { type: "assign-task", task });
      } else {
        sendTo(ws, { type: "error", message: "Keine Aufgabe verfügbar" });
      }
      return;
    }

    // ──── submit-drawing ────
    if (msg.type === "submit-drawing") {
      const prompt = session.currentDrawPrompt;
      if (!prompt) {
        sendTo(ws, { type: "error", message: "Kein aktiver Zeichen-Auftrag" });
        return;
      }

      if (!msg.imageDataUrl || msg.imageDataUrl.length > 500_000) {
        sendTo(ws, { type: "error", message: "Zeichnung zu groß" });
        return;
      }

      gameStore.addDrawing({
        playerId: session.playerId,
        imageDataUrl: msg.imageDataUrl,
        prompt
      });

      session.currentDrawPrompt = null;
      saveScheduler.schedule();

      const player = gameStore.getState().players[session.playerId];
      const playerName = player?.name || "Jemand";
      broadcast({ type: "event", text: `${playerName} hat "${prompt}" gezeichnet! 🎨`, createdAt: Date.now() });
      broadcastState();

      // Auto-assign next task
      const nextTask = gameStore.assignTask(clientId);
      if (nextTask) {
        sendTo(ws, { type: "assign-task", task: nextTask });
      }
      return;
    }

    // ──── search-tap ────
    if (msg.type === "search-tap") {
      const expectedDrawingId = session.currentSearchDrawingId;
      if (!expectedDrawingId) {
        sendTo(ws, { type: "error", message: "Kein aktiver Such-Auftrag" });
        return;
      }

      const result = gameStore.checkSearchTap({
        playerId: session.playerId,
        tappedDrawingId: msg.drawingId,
        expectedDrawingId
      });

      if (result.correct) {
        session.currentSearchDrawingId = null;
        saveScheduler.schedule();

        const player = gameStore.getState().players[session.playerId];
        const playerName = player?.name || "Jemand";
        const artistName = result.artist?.name || "Jemand";
        const drawingPrompt = result.drawing?.prompt || "?";

        sendTo(ws, { type: "search-result", correct: true, drawingId: msg.drawingId, message: "Richtig! 🎉 +1 Punkt" });

        if (player) {
          broadcast({ type: "score-update", playerId: player.id, newScore: player.score, reason: `hat "${drawingPrompt}" gefunden` });
        }
        if (result.artist && result.artist.id !== session.playerId) {
          broadcast({ type: "score-update", playerId: result.artist.id, newScore: result.artist.score, reason: `Zeichnung "${drawingPrompt}" wurde gefunden` });
        }

        broadcast({
          type: "event",
          text: `${playerName} hat "${drawingPrompt}" von ${artistName} gefunden! 🔍✅`,
          createdAt: Date.now()
        });

        broadcastState();

        // Auto-assign next task
        const nextTask = gameStore.assignTask(clientId);
        if (nextTask) {
          sendTo(ws, { type: "assign-task", task: nextTask });
        }
      } else {
        sendTo(ws, { type: "search-result", correct: false, drawingId: msg.drawingId, message: "Falsch! Versuch es nochmal. ❌" });
      }
      return;
    }

    // ──── reset ────
    if (msg.type === "reset") {
      gameStore.reset();
      saveScheduler.schedule();
      broadcastState();
      broadcast({ type: "event", text: "Spiel wurde zurückgesetzt! 🔄", createdAt: Date.now() });
      return;
    }

    // ──── ping ────
    if (msg.type === "ping") {
      sendTo(ws, { type: "pong", t: msg.t, serverTime: Date.now() });
      return;
    }
  });

  ws.on("close", () => {
    if (clientId) {
      clients.delete(clientId);
      gameStore.removeSession(clientId);
    }
  });
});

// ══════════════════════════════════════════════════════
//  Start server
// ══════════════════════════════════════════════════════

server.listen(backendConfig.port, "0.0.0.0", () => {
  const hostname: string = os.hostname();
  const mdnsHost: string = `${hostname}.local`;

  const networkInterfaces = os.networkInterfaces();
  const ipv4Addresses: string[] = [];

  for (const interfaceName of Object.keys(networkInterfaces)) {
    const entries = networkInterfaces[interfaceName] ?? [];
    for (const entry of entries) {
      if (entry.family === "IPv4" && !entry.internal) {
        ipv4Addresses.push(entry.address);
      }
    }
  }

  console.log(`[backend] 🎨 Draw & Search game`);
  console.log(`[backend] listening on port ${backendConfig.port}`);
  console.log(`[backend] WebSocket at /ws`);
  console.log(`[backend] persist file: ${backendConfig.persistPath}`);

  if (backendConfig.shouldServeStatic) {
    console.log(`[backend] serving static frontend from apps/frontend/dist/frontend`);
  }

  console.log("");
  console.log("Open (mDNS / Bonjour):");
  console.log(`  http://${mdnsHost}:${backendConfig.port}/#/player`);
  console.log(`  http://${mdnsHost}:${backendConfig.port}/#/board`);

  if (ipv4Addresses.length > 0) {
    console.log("");
    console.log("Open (LAN IPv4):");
    for (const ipAddress of ipv4Addresses) {
      console.log(`  http://${ipAddress}:${backendConfig.port}/#/player`);
      console.log(`  http://${ipAddress}:${backendConfig.port}/#/board`);
    }
  }
});

