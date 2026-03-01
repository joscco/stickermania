import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { loadBackendConfig } from "./config.js";
import { serveStatic } from "./http/static.js";
import { WorldStore } from "./world/worldStore.js";
import {loadWorldFromDisk, saveWorldToDisk} from "./world/persistence.js";
import { sanitizeWorldState } from "./world/validation.js";
import type { WorldState } from "@birthday/shared";

function createEmptyWorld(): WorldState {
  return {
    placements: {},
    revision: 0,
    updatedAt: Date.now()
  };
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

  // fallback (will produce a clearer error in logs once we improve serveStatic)
  return firstCandidate;
}

const backendConfig = loadBackendConfig({ argv: process.argv, cwd: process.cwd() });

const fallbackWorldState: WorldState = createEmptyWorld();

const loadedCandidateWorldState: WorldState = loadWorldFromDisk({
  persistPath: backendConfig.persistPath,
  createEmptyWorld: () => fallbackWorldState
});

const initialWorldState: WorldState = sanitizeWorldState({
  candidate: loadedCandidateWorldState,
  fallback: fallbackWorldState
});

const worldStore = new WorldStore({ initialWorldState });

const server = http.createServer((request, response) => {
  // --- API: info -------------------------------------------------------------
  if (request.url?.startsWith("/api/info") && request.method === "GET") {
    const hostHeader: string = String(request.headers.host ?? "");
    const protocol: string = "http"; // im LAN ok; später mit Proxy/https würden wir es anders bestimmen

    const baseUrl: string = `${protocol}://${hostHeader}`;

    const payload = {
      baseUrl,
      // legacy fields (optional, kann der Frontend-Code später ignorieren)
      gridWidth: backendConfig.gridWidth,
      gridHeight: backendConfig.gridHeight
    };

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }

  // --- API: state (polling) --------------------------------------------------
  if (request.url?.startsWith("/api/state") && request.method === "GET") {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const sinceRevisionRaw: string | null = url.searchParams.get("sinceRevision");
    const sinceRevision: number = sinceRevisionRaw ? Number(sinceRevisionRaw) : -1;

    const state: WorldState = worldStore.getState();

    // If client already has this revision -> no content (cheap polling)
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
        saveWorldToDisk({ persistPath: backendConfig.persistPath, worldState: worldStore.getState() });

        response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ ok: true, placement }));
      } catch {
        response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Invalid JSON");
      }
    });

    return;
  }

  // --- API: reset ------------------------------------------------------------
  if (request.url?.startsWith("/api/reset") && request.method === "POST") {
    worldStore.reset();
    saveWorldToDisk({ persistPath: backendConfig.persistPath, worldState: worldStore.getState() });

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true }));
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
  console.log(`[backend] polling endpoint: /api/state?sinceRevision=...`);
  console.log(`[backend] persist file: ${backendConfig.persistPath}`);

  if (backendConfig.shouldServeStatic) {
    console.log(`[backend] serving static frontend from apps/frontend/dist/frontend`);
  }

  // Nice URLs:
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