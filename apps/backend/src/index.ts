import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { loadBackendConfig } from "./config.js";
import { serveStatic } from "./http/static.js";
import { WorldStore } from "./world/worldStore.js";
import { sanitizeWorldState } from "./world/validation.js";
import type { WorldState } from "@birthday/shared";

import { ChallengeStore } from "./game/challengeStore.js";
import { SaveScheduler } from "./game/saveScheduler.js";
import type { PersistedState, ChallengeState } from "./game/gameTypes.js";

function createEmptyWorld(): WorldState {
  return {
    placements: {},
    revision: 0,
    updatedAt: Date.now()
  };
}

function createEmptyChallengeState(): ChallengeState {
  return {
    revision: 0,
    activeChallenge: null,
    activeSubmission: null
  };
}

function loadPersistedState(args: {
  persistPath: string;
  createEmptyWorld: () => WorldState;
  createEmptyChallenge: () => ChallengeState;
}): PersistedState {
  try {
    if (!fs.existsSync(args.persistPath)) {
      return { world: args.createEmptyWorld(), challenge: args.createEmptyChallenge() };
    }

    const raw = fs.readFileSync(args.persistPath, "utf-8");
    const parsed = JSON.parse(raw) as any;

    // Backward compatibility: old file might be just the world state
    const candidateWorld = parsed?.world ?? parsed;
    const candidateChallenge = parsed?.challenge ?? args.createEmptyChallenge();

    return {
      world: candidateWorld ?? args.createEmptyWorld(),
      challenge: candidateChallenge ?? args.createEmptyChallenge()
    };
  } catch {
    return { world: args.createEmptyWorld(), challenge: args.createEmptyChallenge() };
  }
}

function savePersistedState(args: { persistPath: string; state: PersistedState }): void {
  try {
    fs.writeFileSync(args.persistPath, JSON.stringify(args.state, null, 2), "utf-8");
  } catch {
    // party mode: ignore persistence issues
  }
}

function resolveFrontendDistRootAbsolutePath(): string {
  const firstCandidate: string = path.resolve(process.cwd(), "apps/frontend/dist/frontend");
  const secondCandidate: string = path.resolve(process.cwd(), "apps/frontend/dist/frontend/browser");

  const firstIndexPath: string = path.resolve(firstCandidate, "index.html");
  if (fs.existsSync(firstIndexPath)) {
    return firstCandidate;
  }

  const secondIndexPath: string = path.resolve(secondCandidate, "index.html");
  if (fs.existsSync(secondIndexPath)) {
    return secondCandidate;
  }

  return firstCandidate;
}

const backendConfig = loadBackendConfig({ argv: process.argv, cwd: process.cwd() });

const persisted = loadPersistedState({
  persistPath: backendConfig.persistPath,
  createEmptyWorld: () => createEmptyWorld(),
  createEmptyChallenge: () => createEmptyChallengeState()
});

const initialWorldState: WorldState = sanitizeWorldState({
  candidate: persisted.world,
  fallback: createEmptyWorld()
});

const worldStore = new WorldStore({ initialWorldState });
const challengeStore = new ChallengeStore({ initial: persisted.challenge });

const saveScheduler = new SaveScheduler({
  debounceMs: 400,
  saveFn: () => {
    savePersistedState({
      persistPath: backendConfig.persistPath,
      state: { world: worldStore.getState(), challenge: challengeStore.getState() }
    });
  }
});

const server = http.createServer((request, response) => {
  // --- API: info -------------------------------------------------------------
  if (request.url?.startsWith("/api/info") && request.method === "GET") {
    const hostHeader: string = String(request.headers.host ?? "");
    const protocol: string = "http";

    const baseUrl: string = `${protocol}://${hostHeader}`;

    const payload = {
      baseUrl,
      // legacy fields (optional)
      gridWidth: backendConfig.gridWidth,
      gridHeight: backendConfig.gridHeight
    };

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }

  // --- API: world state (polling) -------------------------------------------
  if (request.url?.startsWith("/api/state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRevisionRaw: string | null = url.searchParams.get("sinceRevision");
    const sinceRevision: number = sinceRevisionRaw ? Number(sinceRevisionRaw) : -1;

    const state: WorldState = worldStore.getState();

    if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state));
    return;
  }

  // --- API: challenge state (polling) ---------------------------------------
  if (request.url?.startsWith("/api/challenge-state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRevisionRaw: string | null = url.searchParams.get("sinceRevision");
    const sinceRevision: number = sinceRevisionRaw ? Number(sinceRevisionRaw) : -1;

    const state = challengeStore.getState();

    if (Number.isFinite(sinceRevision) && sinceRevision >= 0 && sinceRevision === state.revision) {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(state));
    return;
  }

  // --- API: place ------------------------------------------------------------
  if (request.url?.startsWith("/api/place") && request.method === "POST") {
    let body: string = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });

    request.on("end", () => {
      try {
        const parsed = JSON.parse(body) as {
          x: number;
          y: number;
          objectType: string;
          rotationDeg?: number;
          scale?: number;
        };

        if (!parsed || typeof parsed.objectType !== "string") {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Invalid payload");
          return;
        }

        const placement = worldStore.place({
          x: Number(parsed.x),
          y: Number(parsed.y),
          objectType: parsed.objectType as any,
          rotationDeg: parsed.rotationDeg,
          scale: parsed.scale
        });

        saveScheduler.schedule();

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, placement }));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid JSON");
      }
    });

    return;
  }

  // --- API: reset world ------------------------------------------------------
  if (request.url?.startsWith("/api/reset") && request.method === "POST") {
    worldStore.reset();
    saveScheduler.schedule();

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
    return;
  }

  // --- API: start challenge --------------------------------------------------
  if (request.url?.startsWith("/api/challenge/start") && request.method === "POST") {
    let body: string = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });

    request.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { text: string; durationMs?: number };

        const text: string = String(parsed.text ?? "").trim();
        if (text.length <= 0) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Missing text");
          return;
        }

        const durationMs: number = Number.isFinite(parsed.durationMs) ? Number(parsed.durationMs) : 120_000;

        challengeStore.startChallenge({ text, durationMs });
        saveScheduler.schedule();

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid JSON");
      }
    });

    return;
  }

  // --- API: submit snapshot for vote ----------------------------------------
  if (request.url?.startsWith("/api/submit") && request.method === "POST") {
    let body: string = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });

    request.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { voterId: string; screenshotDataUrl?: string };

        const voterId: string = String(parsed.voterId ?? "").trim();
        const screenshotDataUrl: string | null =
            typeof parsed.screenshotDataUrl === "string" && parsed.screenshotDataUrl.trim().length > 0
                ? parsed.screenshotDataUrl
                : null;

        const snapshotWorld = worldStore.getState();
        const result = challengeStore.submit({ voterId, snapshotWorld, screenshotDataUrl });

        if (!result.ok) {
          response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(result));
          return;
        }

        saveScheduler.schedule();

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid JSON");
      }
    });

    return;
  }

  // --- API: vote -------------------------------------------------------------
  if (request.url?.startsWith("/api/vote") && request.method === "POST") {
    let body: string = "";
    request.on("data", (chunk) => {
      body += String(chunk);
    });

    request.on("end", () => {
      try {
        const parsed = JSON.parse(body) as { submissionId: string; voterId: string; vote: boolean };

        const submissionId: string = String(parsed.submissionId ?? "").trim();
        const voterId: string = String(parsed.voterId ?? "").trim();
        const vote: boolean = Boolean(parsed.vote);

        if (submissionId.length <= 0 || voterId.length <= 0) {
          response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Missing submissionId or voterId");
          return;
        }

        const result = challengeStore.vote({ submissionId, voterId, vote });

        if (!result.ok) {
          response.writeHead(409, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(result));
          return;
        }

        saveScheduler.schedule();

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true }));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid JSON");
      }
    });

    return;
  }

  // --- Static frontend -------------------------------------------------------
  if (backendConfig.shouldServeStatic) {
    const distRootAbsolutePath: string = resolveFrontendDistRootAbsolutePath();
    serveStatic({ request, response, distRootAbsolutePath });
    return;
  }

  // --- Fallback --------------------------------------------------------------
  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Sandbox Backend running. Polling API at /api/state");
});

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

  console.log(`[backend] listening on port ${backendConfig.port}`);
  console.log(`[backend] polling endpoints: /api/state · /api/challenge-state`);
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
  } else {
    console.log("");
    console.log("No LAN IPv4 address detected (maybe only VPN?).");
  }
});