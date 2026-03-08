import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import mime from "mime";
import { WebSocket, WebSocketServer } from "ws";
import type { ClientToServerMessage, GameState, ServerToClientMessage } from "@birthday/shared";
import { loadBackendConfig } from "./config.js";
import { SessionService } from "./app/sessionService.js";
import { FileSessionRepository } from "./infra/local/fileSessionRepository.js";
import { LocalAssetRepository } from "./infra/local/localAssetRepository.js";
import { serveStatic } from "./http/static.js";

const backendConfig = loadBackendConfig({ argv: process.argv, cwd: process.cwd() });
const serverSessionId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const sessionRepository = new FileSessionRepository(backendConfig.sessionsPath);
const assetRepository = new LocalAssetRepository(backendConfig.dataRoot);
const sessionService = new SessionService(backendConfig.gameConfig, sessionRepository, assetRepository);

interface ConnectedClient {
  ws: WebSocket;
  clientId: string;
  sessionId: string;
  kind: "player" | "board";
  playerId: string;
}

const clients = new Map<string, ConnectedClient>();

function sendTo(ws: WebSocket, message: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function broadcastToSession(sessionId: string, message: ServerToClientMessage): void {
  const payload = JSON.stringify(message);
  for (const client of clients.values()) {
    if (client.sessionId === sessionId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(payload);
    }
  }
}

function broadcastState(sessionId: string, state?: GameState | null): void {
  const resolvedState = state ?? sessionService.getRuntimeState(sessionId);
  if (!resolvedState) {
    return;
  }
  broadcastToSession(sessionId, { type: "state", state: resolvedState });
}

function buildBaseUrl(request: http.IncomingMessage): string {
  return `${request.headers["x-forwarded-proto"] ?? "http"}://${request.headers.host ?? `localhost:${backendConfig.gameConfig.port}`}`;
}

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

async function readJsonBody<T>(request: http.IncomingMessage): Promise<T | null> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) {
    return null;
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf-8")) as T;
  } catch {
    return null;
  }
}

function serveAsset(response: http.ServerResponse, assetRelativePath: string): void {
  const filePath = path.resolve(backendConfig.dataRoot, "assets", assetRelativePath);
  const expectedPrefix = path.resolve(backendConfig.dataRoot, "assets");
  if (!filePath.startsWith(expectedPrefix)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }
  try {
    const content = fs.readFileSync(filePath);
    response.writeHead(200, { "Content-Type": mime.getType(filePath) ?? "application/octet-stream" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

sessionService.setOnSessionStateChanged(async (sessionId, state) => {
  const phase = state.round.phase;
  if (phase === "SEARCH") {
    broadcastToSession(sessionId, { type: "event", text: "⏰ Zeichenzeit vorbei! Jetzt suchen! 🔍", createdAt: Date.now() });
  }
  if (phase === "PAUSED") {
    broadcastToSession(sessionId, { type: "event", text: "⏰ Runde beendet! 🏁", createdAt: Date.now() });
  }
  broadcastState(sessionId, state);

  if (phase === "SEARCH") {
    for (const client of clients.values()) {
      if (client.sessionId !== sessionId || client.kind !== "player") {
        continue;
      }
      const restoredTask = sessionService.restoreTaskForPlayer(sessionId, client.playerId, "SEARCH")
          ?? sessionService.getAssignedTask(sessionId, client.clientId, "SEARCH");
      if (restoredTask) {
        sendTo(client.ws, { type: "assign-task", task: restoredTask });
      }
    }
  }
});

const JSON_HEADER = { "Content-Type": "application/json; charset=utf-8" };

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", buildBaseUrl(request));

  if (requestUrl.pathname === "/api/sessions" && request.method === "POST") {
    const createdSession = await sessionService.createSession({ baseUrl: buildBaseUrl(request) });
    response.writeHead(201, JSON_HEADER);
    response.end(JSON.stringify(createdSession));
    return;
  }

  if (requestUrl.pathname.startsWith("/api/assets/") && request.method === "GET") {
    serveAsset(response, requestUrl.pathname.replace(/^\/api\/assets\//u, ""));
    return;
  }

  const byCodeMatch = requestUrl.pathname.match(/^\/api\/sessions\/by-code\/([^/]+)$/u);
  if (byCodeMatch && request.method === "GET") {
    const sessionCode = decodeURIComponent(byCodeMatch[1]).trim().toUpperCase();
    const state = await sessionService.loadStateByCode(sessionCode);

    if (!state) {
      response.writeHead(404, JSON_HEADER);
      response.end(JSON.stringify({ message: "Session not found" }));
      return;
    }

    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({
      sessionId: state.sessionId,
      sessionCode: state.sessionCode,
      createdAt: state.createdAt,
      expiresAt: state.expiresAt,
    }));
    return;
  }

  const stateMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/state$/u);
  if (stateMatch && request.method === "GET") {
    const state = await sessionService.loadState(stateMatch[1]);
    if (!state) {
      response.writeHead(404, JSON_HEADER);
      response.end(JSON.stringify({ message: "Session not found" }));
      return;
    }
    const sinceRevision = Number(requestUrl.searchParams.get("sinceRevision") ?? -1);
    if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
      response.writeHead(204);
      response.end();
      return;
    }
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify(state));
    return;
  }

  const resetMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)\/reset$/u);
  if (resetMatch && request.method === "POST") {
    const state = await sessionService.reset(resetMatch[1]);
    if (!state) {
      response.writeHead(404, JSON_HEADER);
      response.end(JSON.stringify({ message: "Session not found" }));
      return;
    }
    broadcastState(resetMatch[1], state);
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  const deleteMatch = requestUrl.pathname.match(/^\/api\/sessions\/([^/]+)$/u);
  if (deleteMatch && request.method === "DELETE") {
    const deletedSessionId = deleteMatch[1];
    const deleted = await sessionService.deleteSession(deletedSessionId);
    if (!deleted) {
      response.writeHead(404, JSON_HEADER);
      response.end(JSON.stringify({ message: "Session not found" }));
      return;
    }
    // Disconnect all clients of this session
    for (const [clientId, client] of clients.entries()) {
      if (client.sessionId === deletedSessionId) {
        sendTo(client.ws, { type: "error", message: "Session wurde gelöscht." });
        client.ws.close();
        clients.delete(clientId);
      }
    }
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  if (requestUrl.pathname === "/api/info" && request.method === "GET") {
    response.writeHead(200, JSON_HEADER);
    response.end(JSON.stringify({ baseUrl: buildBaseUrl(request) }));
    return;
  }

  if (requestUrl.pathname === "/api/wlan-config" && request.method === "GET") {
    if (backendConfig.wlanConfig) {
      response.writeHead(200, JSON_HEADER);
      response.end(JSON.stringify(backendConfig.wlanConfig));
    } else {
      response.writeHead(404, JSON_HEADER);
      response.end(JSON.stringify({ message: "WLAN config not available" }));
    }
    return;
  }

  if (backendConfig.shouldServeStatic) {
    serveStatic({ request, response, distRootAbsolutePath: resolveFrontendDistPath() });
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Draw & Search Backend running.");
});

const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (request, socket, head) => {
  if (request.url === "/ws" || request.url?.startsWith("/ws?")) {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  } else {
    socket.destroy();
  }
});

const wsPingTimer = setInterval(() => {
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.ping();
    }
  }
}, 25_000);

wss.on("close", () => clearInterval(wsPingTimer));

function activeClientIdsForSession(sessionId: string): Set<string> {
  const activeIds = new Set<string>();
  for (const client of clients.values()) {
    if (client.sessionId === sessionId) {
      activeIds.add(client.clientId);
    }
  }
  return activeIds;
}

function cleanUpStaleSessionsForPlayer(sessionId: string, playerId: string, currentWs: WebSocket): void {
  for (const [existingClientId, client] of clients.entries()) {
    if (client.sessionId === sessionId && client.playerId === playerId && client.ws !== currentWs) {
      clients.delete(existingClientId);
      sessionService.removeConnectionSession(sessionId, existingClientId);
    }
  }
}

function restoreOrAssignTask(ws: WebSocket, sessionId: string, clientId: string, playerId: string): void {
  const round = sessionService.getRound(sessionId);
  if (!round) {
    return;
  }
  if (round.phase === "DRAW") {
    const task = sessionService.restoreTaskForPlayer(sessionId, playerId, "DRAW")
        ?? sessionService.getAssignedTask(sessionId, clientId, "DRAW");
    if (task) {
      sendTo(ws, { type: "assign-task", task });
    }
  } else if (round.phase === "SEARCH") {
    const task = sessionService.restoreTaskForPlayer(sessionId, playerId, "SEARCH")
        ?? sessionService.getAssignedTask(sessionId, clientId, "SEARCH");
    if (task) {
      sendTo(ws, { type: "assign-task", task });
    } else {
      sendTo(ws, { type: "event", text: "Keine Zeichnungen zum Suchen vorhanden. Warte… ⏳", createdAt: Date.now() });
    }
  }
}

wss.on("connection", (ws: WebSocket) => {
  let clientId: string | null = null;
  let sessionId: string | null = null;

  ws.on("message", async (rawData) => {
    let message: ClientToServerMessage;
    try {
      message = JSON.parse(String(rawData));
    } catch {
      sendTo(ws, { type: "error", message: "Invalid JSON" });
      return;
    }

    if (message.type === "join") {
      sessionId = message.sessionId;
      if (message.playerId) {
        cleanUpStaleSessionsForPlayer(sessionId, message.playerId, ws);
      }
      if (clientId) {
        clients.delete(clientId);
        sessionService.removeConnectionSession(sessionId, clientId);
      }

      clientId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const player = await sessionService.join({
        sessionId,
        clientId,
        kind: message.kind,
        existingPlayerId: message.playerId,
      });
      const state = await sessionService.loadState(sessionId);
      if (!player || !state) {
        sendTo(ws, { type: "error", message: "Session nicht gefunden" });
        return;
      }

      clients.set(clientId, { ws, clientId, sessionId, kind: message.kind, playerId: player.id });
      sendTo(ws, {
        type: "welcome",
        clientId,
        playerId: player.id,
        sessionId,
        serverTime: Date.now(),
        serverSessionId,
        assignedColors: sessionService.getPlayerColors(sessionId, player.id),
        fieldWidth: state.effectiveFieldWidth,
        fieldHeight: state.effectiveFieldHeight,
        maxDrawingsPerRound: backendConfig.gameConfig.maxDrawingsPerRound,
        searchOverscroll: backendConfig.gameConfig.searchOverscroll,
        initialZoom: 1,
        imageSizePx: backendConfig.gameConfig.imageSizePx,
        fieldBaseSize: backendConfig.gameConfig.fieldBaseSize,
        fieldGrowthPerDrawing: backendConfig.gameConfig.fieldGrowthPerDrawing,
        fieldMaxSize: backendConfig.gameConfig.fieldMaxSize,
      });
      sendTo(ws, { type: "state", state });

      if (message.kind === "player" && player.name.length > 0) {
        broadcastToSession(sessionId, { type: "event", text: `${player.name} ist beigetreten! 🎉`, createdAt: Date.now() });
      }

      if (message.kind === "player" && player.name.length > 0) {
        restoreOrAssignTask(ws, sessionId, clientId, player.id);
      }
      return;
    }

    if (!clientId || !sessionId) {
      sendTo(ws, { type: "error", message: "Not joined yet" });
      return;
    }

    const runtimeSession = sessionService.getSessionRuntime(sessionId, clientId);
    if (!runtimeSession) {
      sendTo(ws, { type: "error", message: "Session not found" });
      return;
    }

    if (message.type === "set-name") {
      const state = await sessionService.setPlayerName(sessionId, runtimeSession.playerId, message.name);
      if (!state) {
        sendTo(ws, { type: "error", message: "Session not found" });
        return;
      }
      broadcastState(sessionId, state);
      broadcastToSession(sessionId, { type: "event", text: `${message.name.trim().slice(0, 24)} ist beigetreten! 🎉`, createdAt: Date.now() });
      return;
    }

    if (message.type === "submit-avatar") {
      if (!message.avatarDataUrl || message.avatarDataUrl.length > 200_000) {
        sendTo(ws, { type: "error", message: "Avatar too large" });
        return;
      }
      const state = await sessionService.saveAvatar(sessionId, runtimeSession.playerId, message.avatarDataUrl);
      if (!state) {
        sendTo(ws, { type: "error", message: "Spieler nicht gefunden" });
        return;
      }
      broadcastState(sessionId, state);
      return;
    }

    if (message.type === "submit-drawing") {
      const round = sessionService.getRound(sessionId);
      if (round?.phase !== "DRAW") {
        sendTo(ws, { type: "error", message: "Gerade keine Zeichenphase" });
        return;
      }
      const activePrompt = sessionService.getActiveDrawPrompt(sessionId, runtimeSession.playerId);
      if (!activePrompt) {
        sendTo(ws, { type: "error", message: "Kein aktiver Zeichen-Auftrag" });
        return;
      }
      if (!message.imageDataUrl || message.imageDataUrl.length > 500_000) {
        sendTo(ws, { type: "error", message: "Zeichnung zu groß" });
        return;
      }
      const result = await sessionService.submitDrawing({
        sessionId,
        playerId: runtimeSession.playerId,
        prompt: activePrompt,
        imageDataUrl: message.imageDataUrl,
      });
      if (!result) {
        sendTo(ws, { type: "error", message: "Zeichnung konnte nicht gespeichert werden" });
        return;
      }
      broadcastToSession(sessionId, { type: "event", text: `${result.playerName} hat etwas gezeichnet! 🎨`, createdAt: Date.now() });
      broadcastState(sessionId, result.state);

      const nextTask = sessionService.getAssignedTask(sessionId, clientId, "DRAW");
      if (nextTask) {
        sendTo(ws, { type: "assign-task", task: nextTask });
      } else {
        sendTo(ws, {
          type: "event",
          text: "Du hast alle Zeichnungen für diese Runde abgegeben! 🎉 Warte auf die Suchphase…",
          createdAt: Date.now(),
        });
      }
      return;
    }

    if (message.type === "search-snapshot") {
      const round = sessionService.getRound(sessionId);
      if (round?.phase !== "SEARCH") {
        sendTo(ws, { type: "error", message: "Gerade keine Suchphase" });
        return;
      }
      const targetDrawingId = sessionService.getActiveSearchDrawingId(sessionId, runtimeSession.playerId) ?? runtimeSession.currentSearchDrawingId;
      if (!targetDrawingId) {
        sendTo(ws, { type: "error", message: "Kein aktiver Such-Auftrag" });
        return;
      }
      const result = await sessionService.checkSearchSnapshot({
        sessionId,
        playerId: runtimeSession.playerId,
        centerX: message.centerX,
        centerY: message.centerY,
        radius: message.radius,
        expectedDrawingId: targetDrawingId,
      });
      if (!result) {
        sendTo(ws, { type: "error", message: "Schnappschuss konnte nicht geprüft werden" });
        return;
      }
      if (result.correct) {
        sendTo(ws, { type: "search-result", correct: true, drawingId: targetDrawingId, message: "Richtig! 🎉 +1 Punkt" });
        const player = result.state.players[runtimeSession.playerId];
        if (player) {
          broadcastToSession(sessionId, { type: "score-update", playerId: player.id, newScore: player.score, reason: "hat eine Zeichnung gefunden" });
        }
        if (result.artist && result.artist.id !== runtimeSession.playerId) {
          broadcastToSession(sessionId, { type: "score-update", playerId: result.artist.id, newScore: result.artist.score, reason: "Zeichnung wurde gefunden" });
        }
        const playerName = player?.name || "Jemand";
        const artistName = result.artist?.name || "Jemand";
        broadcastToSession(sessionId, { type: "event", text: `${playerName} hat eine Zeichnung von ${artistName} gefunden! 🔍✅`, createdAt: Date.now() });
        broadcastState(sessionId, result.state);

        const nextTask = sessionService.getAssignedTask(sessionId, clientId, "SEARCH");
        if (nextTask) {
          sendTo(ws, { type: "assign-task", task: nextTask });
        }
      } else {
        sendTo(ws, { type: "search-result", correct: false, drawingId: targetDrawingId, message: "Nicht getroffen! Versuch es nochmal. ❌" });
      }
      return;
    }

    if (message.type === "start-round") {
      sessionService.purgeDisconnectedSessions(sessionId, activeClientIdsForSession(sessionId));
      const state = await sessionService.startRound(sessionId);
      if (!state) {
        sendTo(ws, { type: "error", message: "Session not found" });
        return;
      }

      const assignedPlayerIds = new Set<string>();
      for (const connectionSession of sessionService.getAllConnectionSessions(sessionId)) {
        if (connectionSession.kind !== "player" || assignedPlayerIds.has(connectionSession.playerId)) {
          continue;
        }
        const player = state.players[connectionSession.playerId];
        if (!player || !player.name) {
          continue;
        }
        const client = clients.get(connectionSession.clientId);
        if (!client) {
          continue;
        }
        assignedPlayerIds.add(connectionSession.playerId);
        const task = sessionService.getAssignedTask(sessionId, connectionSession.clientId, "DRAW");
        if (task) {
          sendTo(client.ws, { type: "assign-task", task });
        }
      }

      broadcastToSession(sessionId, { type: "event", text: `🎨 Runde ${state.round.roundNumber} startet! Zeichnet!`, createdAt: Date.now() });
      broadcastState(sessionId, state);
      return;
    }

    if (message.type === "set-timer") {
      const state = await sessionService.setTimerConfig(sessionId, message.drawDurationSec, message.searchDurationSec);
      if (state) {
        broadcastState(sessionId, state);
      }
      return;
    }

    if (message.type === "reset") {
      const state = await sessionService.reset(sessionId);
      if (state) {
        broadcastState(sessionId, state);
        broadcastToSession(sessionId, { type: "event", text: "Spiel wurde zurückgesetzt! 🔄", createdAt: Date.now() });
      }
      return;
    }

    if (message.type === "ping") {
      sendTo(ws, { type: "pong", t: message.t, serverTime: Date.now() });
    }
  });

  ws.on("close", () => {
    if (clientId && sessionId) {
      clients.delete(clientId);
    }
  });
});

server.listen(backendConfig.gameConfig.port, "0.0.0.0", () => {
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
  console.log(`[backend] listening on port ${backendConfig.gameConfig.port}`);
  console.log(`[backend] sessions stored in: ${backendConfig.sessionsPath}`);
  console.log(`[backend] assets stored in: ${backendConfig.assetsPath}`);
  if (backendConfig.shouldServeStatic) {
    console.log(`[backend] serving static frontend`);
  }
  console.log(`\nOpen board to create a session:\n  http://${mdnsHost}:${backendConfig.gameConfig.port}/#/board`);
  if (lanIps.length > 0) {
    console.log(`\nOpen (LAN IPv4):`);
    for (const ipAddress of lanIps) {
      console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/board`);
      console.log(`  http://${ipAddress}:${backendConfig.gameConfig.port}/#/player`);
    }
  }
});

setInterval(() => {
  sessionService.cleanupExpiredSessions(Date.now()).catch((error) => {
    console.error("[cleanup] failed", error);
  });
}, 15 * 60 * 1000);