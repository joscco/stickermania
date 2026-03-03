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
const gc = backendConfig.gameConfig;

const drawingsBasePath = path.resolve(process.cwd(), gc.drawingsPath);

const initialGameState: GameState = loadGameFromDisk({
  persistPath: backendConfig.persistPath,
  createEmpty: () => GameStore.createEmpty(gc)
});

const gameStore = new GameStore({ config: gc, initial: initialGameState });

const saveScheduler = new SaveScheduler({
  debounceMs: 400,
  saveFn: () => { saveGameToDisk({ persistPath: backendConfig.persistPath, state: gameStore.getState() }); }
});

// ══════════════════════════════════════════════════════
//  Track connected clients
// ══════════════════════════════════════════════════════

interface ConnectedClient { ws: WebSocket; clientId: string; kind: "player" | "board"; playerId: string; }

const clients = new Map<string, ConnectedClient>();

function broadcast(message: ServerToClientMessage): void {
  const json = JSON.stringify(message);
  for (const client of clients.values()) { if (client.ws.readyState === WebSocket.OPEN) client.ws.send(json); }
}
function broadcastState(): void { broadcast({ type: "state", state: gameStore.getState() }); }
function sendTo(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

// ──────── Round phase change handler ────────

gameStore.setOnPhaseChange(() => {
  const round = gameStore.getRound();
  saveScheduler.schedule();
  if (round.phase === "SEARCH") {
    broadcast({ type: "event", text: "⏰ Zeichenzeit vorbei! Jetzt suchen! 🔍", createdAt: Date.now() });
    broadcastState();
    for (const session of gameStore.getAllSessions()) {
      if (session.kind !== "player") continue;
      const client = clients.get(session.clientId);
      if (!client) continue;
      const task = gameStore.assignSearchTask(session.clientId);
      if (task) {
        sendTo(client.ws, { type: "assign-task", task });
      } else {
        // No drawings available for this player to search — tell them
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

function resolveFrontendDistRootAbsolutePath(): string {
  const a = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
  const b = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");
  if (fs.existsSync(path.resolve(a, "index.html"))) return a;
  if (fs.existsSync(path.resolve(b, "index.html"))) return b;
  return a;
}

const server = http.createServer((request, response) => {
  if (request.url?.startsWith("/api/info") && request.method === "GET") {
    const state = gameStore.getState();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ baseUrl: `http://${request.headers.host ?? ""}`, fieldWidth: state.effectiveFieldWidth, fieldHeight: state.effectiveFieldHeight }));
    return;
  }
  if (request.url?.startsWith("/api/state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRev = Number(url.searchParams.get("sinceRevision") ?? -1);
    const state = gameStore.getState();
    if (Number.isFinite(sinceRev) && sinceRev >= 0 && sinceRev === state.revision) { response.writeHead(204); response.end(); return; }
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state)); return;
  }
  if (request.url?.startsWith("/api/reset") && request.method === "POST") {
    gameStore.reset(); saveScheduler.schedule(); broadcastState();
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true })); return;
  }
  if (backendConfig.shouldServeStatic) {
    serveStatic({ request, response, distRootAbsolutePath: resolveFrontendDistRootAbsolutePath() }); return;
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
    wss.handleUpgrade(request, socket, head, (ws) => { wss.emit("connection", ws, request); });
  } else { socket.destroy(); }
});

// ──── Server-side WS keep-alive (ping every 25 s — NAT keepalive only) ────
// We do NOT terminate unresponsive clients — the client will reconnect on
// its own. Terminating causes the player entry to be lost.
const WS_PING_INTERVAL = 25_000;

const wsPingTimer = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  }
}, WS_PING_INTERVAL);

wss.on("close", () => { clearInterval(wsPingTimer); });

wss.on("connection", (ws: WebSocket) => {
  let clientId: string | null = null;


  ws.on("message", (rawData) => {
    let msg: ClientToServerMessage;
    try { msg = JSON.parse(String(rawData)); } catch { sendTo(ws, { type: "error", message: "Invalid JSON" }); return; }

    // ──── join ────
    if (msg.type === "join") {
      // Clean up any previous session/client entry for this player (reconnect scenario)
      if (msg.playerId) {
        for (const [cid, client] of clients.entries()) {
          if (client.playerId === msg.playerId && client.ws !== ws) {
            clients.delete(cid);
            gameStore.removeSession(cid);
          }
        }
      }
      // Also clean up any previous session tied to THIS ws (double-join on same socket)
      if (clientId) {
        clients.delete(clientId);
        gameStore.removeSession(clientId);
      }

      clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const player = gameStore.joinPlayer({ clientId, kind: msg.kind, existingPlayerId: msg.playerId });
      clients.set(clientId, { ws, clientId, kind: msg.kind, playerId: player.id });
      sendTo(ws, { type: "welcome", clientId, playerId: player.id, serverTime: Date.now(), assignedColors: gameStore.getPlayerColors(player.id), fieldWidth: 1000, fieldHeight: 1000, maxDrawingsPerRound: gc.maxDrawingsPerRound, searchOverscroll: gc.searchOverscroll, initialZoom: 1 });
      sendTo(ws, { type: "state", state: gameStore.getState() });
      if (msg.kind === "player" && player.name.length > 0)
        broadcast({ type: "event", text: `${player.name} ist beigetreten! 🎉`, createdAt: Date.now() });
      const round = gameStore.getRound();
      if (msg.kind === "player" && player.name.length > 0 && player.avatarDataUrl) {
        if (round.phase === "DRAW") {
          // On reconnect, return the current (persisted) draw task, or assign the first one
          let t = gameStore.getCurrentDrawTaskForPlayer(player.id);
          if (!t) t = gameStore.assignDrawTask(clientId);
          if (t) sendTo(ws, { type: "assign-task", task: t });
        } else if (round.phase === "SEARCH") {
          // On reconnect, return the current (persisted) search task, or assign the first one
          let t = gameStore.getCurrentSearchTaskForPlayer(player.id);
          if (!t) t = gameStore.assignSearchTask(clientId);
          if (t) {
            sendTo(ws, { type: "assign-task", task: t });
          } else {
            sendTo(ws, { type: "event", text: "Keine Zeichnungen zum Suchen vorhanden. Warte… ⏳", createdAt: Date.now() });
          }
        }
      }
      saveScheduler.schedule();
      return;
    }

    if (!clientId) { sendTo(ws, { type: "error", message: "Not joined yet" }); return; }
    const session = gameStore.getSession(clientId);
    if (!session) { sendTo(ws, { type: "error", message: "Session not found" }); return; }

    // ──── set-name ────
    if (msg.type === "set-name") {
      const name = (msg.name ?? "").trim().slice(0, 24);
      if (name.length === 0) { sendTo(ws, { type: "error", message: "Name darf nicht leer sein" }); return; }
      gameStore.setPlayerName(session.playerId, name);
      saveScheduler.schedule(); broadcastState();
      broadcast({ type: "event", text: `${name} ist beigetreten! 🎉`, createdAt: Date.now() });
      return;
    }

    // ──── submit-avatar ────
    if (msg.type === "submit-avatar") {
      if (!msg.avatarDataUrl || msg.avatarDataUrl.length > 200_000) { sendTo(ws, { type: "error", message: "Avatar too large" }); return; }
      gameStore.setPlayerAvatar(session.playerId, msg.avatarDataUrl);
      saveScheduler.schedule(); broadcastState();
      // Save avatar to disk
      const player = gameStore.getState().players[session.playerId];
      if (player?.name) {
        saveAvatarToDisk({ basePath: drawingsBasePath, playerName: player.name, imageDataUrl: msg.avatarDataUrl })
          .then(p => console.log(`[save] avatar → ${p}`))
          .catch(e => console.error(`[save] avatar error:`, e));
      }
      return;
    }

    // ──── submit-drawing ────
    if (msg.type === "submit-drawing") {
      const round = gameStore.getRound();
      if (round.phase !== "DRAW") { sendTo(ws, { type: "error", message: "Gerade keine Zeichenphase" }); return; }
      // Use persisted activeDrawPrompt as the source of truth (survives reconnects)
      const prompt = gameStore.getActiveDrawPrompt(session.playerId);
      if (!prompt) { sendTo(ws, { type: "error", message: "Kein aktiver Zeichen-Auftrag" }); return; }
      if (!msg.imageDataUrl || msg.imageDataUrl.length > 500_000) { sendTo(ws, { type: "error", message: "Zeichnung zu groß" }); return; }

      const drawing = gameStore.addDrawing({ playerId: session.playerId, imageDataUrl: msg.imageDataUrl, prompt });
      session.currentDrawPrompt = null;
      gameStore.clearActiveDrawPrompt(session.playerId);
      saveScheduler.schedule();

      const player = gameStore.getState().players[session.playerId];
      const playerName = player?.name || "Jemand";
      broadcast({ type: "event", text: `${playerName} hat "${prompt}" gezeichnet! 🎨`, createdAt: Date.now() });
      broadcastState();

      // Save drawing to disk
      saveDrawingToDisk({ basePath: drawingsBasePath, playerName, prompt, drawingId: drawing.id, imageDataUrl: msg.imageDataUrl })
        .then(p => console.log(`[save] drawing → ${p}`))
        .catch(e => console.error(`[save] drawing error:`, e));

      if (gameStore.getRound().phase === "DRAW") {
        const next = gameStore.assignDrawTask(clientId);
        if (next) {
          sendTo(ws, { type: "assign-task", task: next });
        } else {
          sendTo(ws, { type: "event", text: "Du hast alle Zeichnungen für diese Runde abgegeben! 🎉 Warte auf die Suchphase…", createdAt: Date.now() });
        }
      }
      return;
    }

    // ──── search-snapshot ────
    if (msg.type === "search-snapshot") {
      const round = gameStore.getRound();
      if (round.phase !== "SEARCH") { sendTo(ws, { type: "error", message: "Gerade keine Suchphase" }); return; }
      // Use persisted activeSearchDrawingId as the source of truth
      const expectedDrawingId = gameStore.getActiveSearchDrawingId(session.playerId) ?? session.currentSearchDrawingId;
      if (!expectedDrawingId) { sendTo(ws, { type: "error", message: "Kein aktiver Such-Auftrag" }); return; }
      const result = gameStore.checkSearchSnapshot({
        playerId: session.playerId, centerX: msg.centerX, centerY: msg.centerY, radius: msg.radius, expectedDrawingId
      });
      if (result.correct) {
        session.currentSearchDrawingId = null;
        gameStore.clearActiveSearchTask(session.playerId);
        saveScheduler.schedule();
        const player = gameStore.getState().players[session.playerId];
        const playerName = player?.name || "Jemand";
        const artistName = result.artist?.name || "Jemand";
        const drawingPrompt = result.drawing?.prompt || "?";
        sendTo(ws, { type: "search-result", correct: true, drawingId: expectedDrawingId, message: "Richtig! 🎉 +1 Punkt" });
        if (player) broadcast({ type: "score-update", playerId: player.id, newScore: player.score, reason: `hat "${drawingPrompt}" gefunden` });
        if (result.artist && result.artist.id !== session.playerId)
          broadcast({ type: "score-update", playerId: result.artist.id, newScore: result.artist.score, reason: `Zeichnung "${drawingPrompt}" wurde gefunden` });
        broadcast({ type: "event", text: `${playerName} hat "${drawingPrompt}" von ${artistName} gefunden! 🔍✅`, createdAt: Date.now() });
        broadcastState();
        if (gameStore.getRound().phase === "SEARCH") {
          const next = gameStore.assignSearchTask(clientId);
          if (next) sendTo(ws, { type: "assign-task", task: next });
        }
      } else {
        sendTo(ws, { type: "search-result", correct: false, drawingId: expectedDrawingId, message: "Nicht getroffen! Versuch es nochmal. ❌" });
      }
      return;
    }

    // ──── start-round ────
    if (msg.type === "start-round") {
      gameStore.startDrawPhase(); saveScheduler.schedule();
      for (const s of gameStore.getAllSessions()) {
        if (s.kind !== "player") continue;
        const p = gameStore.getState().players[s.playerId];
        if (!p || !p.name || !p.avatarDataUrl) continue;
        const task = gameStore.assignDrawTask(s.clientId);
        const c = clients.get(s.clientId);
        if (task && c) sendTo(c.ws, { type: "assign-task", task });
      }
      broadcast({ type: "event", text: `🎨 Runde ${gameStore.getRound().roundNumber} startet! Zeichnet!`, createdAt: Date.now() });
      broadcastState(); return;
    }

    // ──── set-timer ────
    if (msg.type === "set-timer") {
      gameStore.setTimerConfig(msg.drawDurationSec, msg.searchDurationSec);
      saveScheduler.schedule(); broadcastState(); return;
    }

    // ──── reset ────
    if (msg.type === "reset") {
      gameStore.reset(); saveScheduler.schedule(); broadcastState();
      broadcast({ type: "event", text: "Spiel wurde zurückgesetzt! 🔄", createdAt: Date.now() }); return;
    }

    // ──── ping ────
    if (msg.type === "ping") { sendTo(ws, { type: "pong", t: msg.t, serverTime: Date.now() }); return; }
  });

  ws.on("close", () => {
    // Remove from active-clients map, but do NOT remove the session from
    // gameStore — the player must be able to rejoin and keep their score.
    if (clientId) { clients.delete(clientId); }
  });
});

// ══════════════════════════════════════════════════════
//  Start
// ══════════════════════════════════════════════════════

server.listen(gc.port, "0.0.0.0", () => {
  const mdns = `${os.hostname()}.local`;
  const ips: string[] = [];
  for (const [, entries] of Object.entries(os.networkInterfaces())) {
    for (const e of entries ?? []) { if (e.family === "IPv4" && !e.internal) ips.push(e.address); }
  }
  console.log(`[backend] 🎨 Draw & Search game`);
  console.log(`[backend] listening on port ${gc.port}`);
  console.log(`[backend] persist: ${backendConfig.persistPath}`);
  console.log(`[backend] drawings saved to: ${drawingsBasePath}`);
  if (backendConfig.shouldServeStatic) console.log(`[backend] serving static frontend`);
  console.log(`\nOpen (mDNS):\n  http://${mdns}:${gc.port}/#/player\n  http://${mdns}:${gc.port}/#/board`);
  if (ips.length > 0) { console.log(`\nOpen (LAN IPv4):`); for (const ip of ips) { console.log(`  http://${ip}:${gc.port}/#/player`); console.log(`  http://${ip}:${gc.port}/#/board`); } }
});

