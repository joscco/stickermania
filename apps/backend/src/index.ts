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
import { saveDrawingToDisk, saveAvatarToDisk } from "./world/drawingSaver.js";
import type { ClientToServerMessage, ServerToClientMessage, GameState } from "@birthday/shared";

// ══════════════════════════════════════════════════════
//  Bootstrap
// ══════════════════════════════════════════════════════

const backendConfig = loadBackendConfig({ argv: process.argv, cwd: process.cwd() });
const gameConfig = backendConfig.gameConfig;

const drawingsBasePath = path.resolve(process.cwd(), gameConfig.drawingsPath);

const initialGameState: GameState = loadGameFromDisk({
  persistPath: backendConfig.persistPath,
  createEmpty: () => GameStore.createEmpty(gameConfig),
});

const gameStore = new GameStore({ config: gameConfig, initial: initialGameState });

const saveScheduler = new SaveScheduler({
  debounceMs: 400,
  saveFn: () => {
    saveGameToDisk({ persistPath: backendConfig.persistPath, state: gameStore.getState() });
  },
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

// ──────── Round phase change handler ────────

gameStore.setOnPhaseChange(() => {
  const round = gameStore.getRound();
  saveScheduler.schedule();

  if (round.phase === "SEARCH") {
    broadcast({ type: "event", text: "⏰ Zeichenzeit vorbei! Jetzt suchen! 🔍", createdAt: Date.now() });
    broadcastState();

    for (const session of gameStore.getAllSessions()) {
      if (session.kind !== "player") {
        continue;
      }
      const client = clients.get(session.clientId);
      if (!client) {
        continue;
      }
      const task = gameStore.assignSearchTask(session.clientId);
      if (task) {
        sendTo(client.ws, { type: "assign-task", task });
      } else {
        sendTo(client.ws, { type: "event", text: "Keine Zeichnungen zum Suchen vorhanden. Warte auf die nächste Runde… ⏳", createdAt: Date.now() });
      }
    }
  } else if (round.phase === "PAUSED") {
    broadcast({ type: "event", text: "⏰ Runde beendet! 🏁", createdAt: Date.now() });
    broadcastState();
  }
});

// ══════════════════════════════════════════════════════
//  HTTP server
// ══════════════════════════════════════════════════════

function resolveFrontendDistPath(): string {
  const withoutBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
  const withBrowser = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");
  if (fs.existsSync(path.resolve(withoutBrowser, "index.html"))) {
    return withoutBrowser;
  }
  if (fs.existsSync(path.resolve(withBrowser, "index.html"))) {
    return withBrowser;
  }
  return withoutBrowser;
}

const JSON_HEADER = { "Content-Type": "application/json; charset=utf-8" };

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/info") && request.method === "GET") {
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({ baseUrl: `http://${request.headers.host ?? ""}` }));
    return;
  }

  if (request.url?.startsWith("/api/state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRevision = Number(url.searchParams.get("sinceRevision") ?? -1);
    const state = gameStore.getState();
    if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify(state));
    return;
  }

  if (request.url?.startsWith("/api/reset") && request.method === "POST") {
    gameStore.reset();
    saveScheduler.schedule();
    broadcastState();
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (backendConfig.shouldServeStatic) {
    serveStatic({ request, response, distRootAbsolutePath: resolveFrontendDistPath() });
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Draw & Search Backend running.");
});

// ══════════════════════════════════════════════════════
//  WebSocket server
// ══════════════════════════════════════════════════════

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws" || request.url?.startsWith("/ws?")) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } else {
    socket.destroy();
  }
});

// Server-side WS keep-alive (ping every 25s — NAT keepalive only).
// We do NOT terminate unresponsive clients — the client will reconnect on its own.
const WS_PING_INTERVAL_MS = 25_000;
const wsPingTimer = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  }
}, WS_PING_INTERVAL_MS);

wss.on("close", () => clearInterval(wsPingTimer));

// ──────── Helpers for message handlers ────────

/** Remove stale client/session entries for a reconnecting player */
function cleanUpStaleSessionsForPlayer(playerId: string, currentWs: WebSocket): void {
  for (const [existingClientId, client] of clients.entries()) {
    if (client.playerId === playerId && client.ws !== currentWs) {
      clients.delete(existingClientId);
      gameStore.removeSession(existingClientId);
    }
  }
}

/** Try to restore or assign a task for a reconnecting player during an active round */
function restoreOrAssignTask(ws: WebSocket, clientId: string, playerId: string): void {
  const round = gameStore.getRound();

  if (round.phase === "DRAW") {
    const task = gameStore.getCurrentDrawTaskForPlayer(playerId) ?? gameStore.assignDrawTask(clientId);
    if (task) {
      sendTo(ws, { type: "assign-task", task });
    }
  } else if (round.phase === "SEARCH") {
    const task = gameStore.getCurrentSearchTaskForPlayer(playerId) ?? gameStore.assignSearchTask(clientId);
    if (task) {
      sendTo(ws, { type: "assign-task", task });
    } else {
      sendTo(ws, { type: "event", text: "Keine Zeichnungen zum Suchen vorhanden. Warte… ⏳", createdAt: Date.now() });
    }
  }
}

// ──────── WebSocket connection handler ────────

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
      if (msg.playerId) {
        cleanUpStaleSessionsForPlayer(msg.playerId, ws);
      }
      if (clientId) {
        clients.delete(clientId);
        gameStore.removeSession(clientId);
      }

      clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const player = gameStore.joinPlayer({ clientId, kind: msg.kind, existingPlayerId: msg.playerId });
      clients.set(clientId, { ws, clientId, kind: msg.kind, playerId: player.id });

      sendTo(ws, {
        type: "welcome",
        clientId,
        playerId: player.id,
        serverTime: Date.now(),
        assignedColors: gameStore.getPlayerColors(player.id),
        fieldWidth: gameStore.getState().effectiveFieldWidth,
        fieldHeight: gameStore.getState().effectiveFieldHeight,
        maxDrawingsPerRound: gameConfig.maxDrawingsPerRound,
        searchOverscroll: gameConfig.searchOverscroll,
        initialZoom: 1,
      });
      sendTo(ws, { type: "state", state: gameStore.getState() });

      if (msg.kind === "player" && player.name.length > 0) {
        broadcast({ type: "event", text: `${player.name} ist beigetreten! 🎉`, createdAt: Date.now() });
      }

      const isReadyPlayer = msg.kind === "player" && player.name.length > 0 && !!player.avatarDataUrl;
      if (isReadyPlayer) {
        restoreOrAssignTask(ws, clientId, player.id);
      }

      saveScheduler.schedule();
      return;
    }

    // ──── Guard: must be joined ────
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

      const player = gameStore.getState().players[session.playerId];
      if (player?.name) {
        saveAvatarToDisk({ basePath: drawingsBasePath, playerName: player.name, imageDataUrl: msg.avatarDataUrl })
          .then((savedPath) => console.log(`[save] avatar → ${savedPath}`))
          .catch((error) => console.error(`[save] avatar error:`, error));
      }
      return;
    }

    // ──── submit-drawing ────
    if (msg.type === "submit-drawing") {
      if (gameStore.getRound().phase !== "DRAW") {
        sendTo(ws, { type: "error", message: "Gerade keine Zeichenphase" });
        return;
      }
      const activePrompt = gameStore.getActiveDrawPrompt(session.playerId);
      if (!activePrompt) {
        sendTo(ws, { type: "error", message: "Kein aktiver Zeichen-Auftrag" });
        return;
      }
      if (!msg.imageDataUrl || msg.imageDataUrl.length > 500_000) {
        sendTo(ws, { type: "error", message: "Zeichnung zu groß" });
        return;
      }

      const drawing = gameStore.addDrawing({ playerId: session.playerId, imageDataUrl: msg.imageDataUrl, prompt: activePrompt });
      session.currentDrawPrompt = null;
      gameStore.clearActiveDrawPrompt(session.playerId);
      saveScheduler.schedule();

      const playerName = gameStore.getState().players[session.playerId]?.name || "Jemand";
      broadcast({ type: "event", text: `${playerName} hat etwas gezeichnet! 🎨`, createdAt: Date.now() });
      broadcastState();

      saveDrawingToDisk({ basePath: drawingsBasePath, playerName, prompt: activePrompt, drawingId: drawing.id, imageDataUrl: msg.imageDataUrl })
        .then((savedPath) => console.log(`[save] drawing → ${savedPath}`))
        .catch((error) => console.error(`[save] drawing error:`, error));

      if (gameStore.getRound().phase === "DRAW") {
        const nextTask = gameStore.assignDrawTask(clientId);
        if (nextTask) {
          sendTo(ws, { type: "assign-task", task: nextTask });
        } else {
          sendTo(ws, { type: "event", text: "Du hast alle Zeichnungen für diese Runde abgegeben! 🎉 Warte auf die Suchphase…", createdAt: Date.now() });
        }
      }
      return;
    }

    // ──── search-snapshot ────
    if (msg.type === "search-snapshot") {
      if (gameStore.getRound().phase !== "SEARCH") {
        sendTo(ws, { type: "error", message: "Gerade keine Suchphase" });
        return;
      }
      const targetDrawingId = gameStore.getActiveSearchDrawingId(session.playerId) ?? session.currentSearchDrawingId;
      if (!targetDrawingId) {
        sendTo(ws, { type: "error", message: "Kein aktiver Such-Auftrag" });
        return;
      }

      const result = gameStore.checkSearchSnapshot({
        playerId: session.playerId,
        centerX: msg.centerX,
        centerY: msg.centerY,
        radius: msg.radius,
        expectedDrawingId: targetDrawingId,
      });

      if (result.correct) {
        session.currentSearchDrawingId = null;
        gameStore.clearActiveSearchTask(session.playerId);
        saveScheduler.schedule();

        const playerName = gameStore.getState().players[session.playerId]?.name || "Jemand";
        const artistName = result.artist?.name || "Jemand";
        sendTo(ws, { type: "search-result", correct: true, drawingId: targetDrawingId, message: "Richtig! 🎉 +1 Punkt" });

        const player = gameStore.getState().players[session.playerId];
        if (player) {
          broadcast({ type: "score-update", playerId: player.id, newScore: player.score, reason: "hat eine Zeichnung gefunden" });
        }
        if (result.artist && result.artist.id !== session.playerId) {
          broadcast({ type: "score-update", playerId: result.artist.id, newScore: result.artist.score, reason: "Zeichnung wurde gefunden" });
        }
        broadcast({ type: "event", text: `${playerName} hat eine Zeichnung von ${artistName} gefunden! 🔍✅`, createdAt: Date.now() });
        broadcastState();

        if (gameStore.getRound().phase === "SEARCH") {
          const nextTask = gameStore.assignSearchTask(clientId);
          if (nextTask) {
            sendTo(ws, { type: "assign-task", task: nextTask });
          }
        }
      } else {
        sendTo(ws, { type: "search-result", correct: false, drawingId: targetDrawingId, message: "Nicht getroffen! Versuch es nochmal. ❌" });
      }
      return;
    }

    // ──── start-round ────
    if (msg.type === "start-round") {
      // Purge stale sessions whose WebSocket is no longer active
      gameStore.purgeDisconnectedSessions(new Set(clients.keys()));

      gameStore.startDrawPhase();
      saveScheduler.schedule();

      // Deduplicate by playerId so that multiple sessions for the same player
      // (e.g. two browser tabs, or a stale + fresh session) don't consume extra prompts.
      const assignedPlayerIds = new Set<string>();

      for (const playerSession of gameStore.getAllSessions()) {
        if (playerSession.kind !== "player") {
          continue;
        }
        if (assignedPlayerIds.has(playerSession.playerId)) {
          continue;
        }
        const player = gameStore.getState().players[playerSession.playerId];
        if (!player || !player.name || !player.avatarDataUrl) {
          continue;
        }
        // Only assign if this session still has an active WebSocket connection.
        // Otherwise a stale/disconnected session would consume a prompt index
        // and the real client would start at drawIndex 1 instead of 0.
        const client = clients.get(playerSession.clientId);
        if (!client) {
          continue;
        }
        assignedPlayerIds.add(playerSession.playerId);
        const task = gameStore.assignDrawTask(playerSession.clientId);
        if (task) {
          sendTo(client.ws, { type: "assign-task", task });
        }
      }

      broadcast({ type: "event", text: `🎨 Runde ${gameStore.getRound().roundNumber} startet! Zeichnet!`, createdAt: Date.now() });
      broadcastState();
      return;
    }

    // ──── set-timer ────
    if (msg.type === "set-timer") {
      gameStore.setTimerConfig(msg.drawDurationSec, msg.searchDurationSec);
      saveScheduler.schedule();
      broadcastState();
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
    // Remove from active-clients map, but do NOT remove the session from
    // gameStore — the player must be able to rejoin and keep their score.
    if (clientId) {
      clients.delete(clientId);
    }
  });
});

// ══════════════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════════════

server.listen(gameConfig.port, "0.0.0.0", () => {
  const mdnsHost = `${os.hostname()}.local`;
  const lanIps: string[] = [];
  for (const [, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal) {
        lanIps.push(entry.address);
      }
    }
  }

  console.log(`[backend] 🎨 Draw & Search game`);
  console.log(`[backend] listening on port ${gameConfig.port}`);
  console.log(`[backend] persist: ${backendConfig.persistPath}`);
  console.log(`[backend] drawings saved to: ${drawingsBasePath}`);
  if (backendConfig.shouldServeStatic) {
    console.log(`[backend] serving static frontend`);
  }
  console.log(`\nOpen (mDNS):\n  http://${mdnsHost}:${gameConfig.port}/#/player\n  http://${mdnsHost}:${gameConfig.port}/#/board`);
  if (lanIps.length > 0) {
    console.log(`\nOpen (LAN IPv4):`);
    for (const ip of lanIps) {
      console.log(`  http://${ip}:${gameConfig.port}/#/player`);
      console.log(`  http://${ip}:${gameConfig.port}/#/board`);
    }
  }
});

