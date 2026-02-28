import http from "node:http";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { loadBackendConfig } from "./config.js";
import { serveStatic } from "./http/static.js";
import { attachWebSocketServer } from "./ws/wsServer.js";
import { WorldStore } from "./world/worldStore.js";
import { loadWorldFromDisk } from "./world/persistence.js";
import { sanitizeWorldState } from "./world/validation.js";
import type { WorldState } from "@birthday/shared";

function createEmptyWorld(args: { gridWidth: number; gridHeight: number }): WorldState {
  return {
    width: args.gridWidth,
    height: args.gridHeight,
    cells: {},
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

const fallbackWorldState: WorldState = createEmptyWorld({
  gridWidth: backendConfig.gridWidth,
  gridHeight: backendConfig.gridHeight
});

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
  if (request.url?.startsWith("/api/info")) {
    const hostHeader: string = String(request.headers.host ?? "");
    const protocol: string = "http"; // im LAN ok; später mit Proxy/https würden wir es anders bestimmen

    const baseUrl: string = `${protocol}://${hostHeader}`;
    const wsUrl: string = `${protocol === "https" ? "wss" : "ws"}://${hostHeader}/ws`;

    const payload = {
      baseUrl,
      wsUrl,
      gridWidth: backendConfig.gridWidth,
      gridHeight: backendConfig.gridHeight
    };

    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify(payload));
    return;
  }

  if (backendConfig.shouldServeStatic) {
    const distRootAbsolutePath: string = resolveFrontendDistRootAbsolutePath();
    serveStatic({ request, response, distRootAbsolutePath });
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Sandbox Backend running. WebSocket at /ws");
});

attachWebSocketServer({ server, backendConfig, worldStore });

server.listen(backendConfig.port,"0.0.0.0", () => {
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
  console.log(`[backend] websocket path: /ws`);
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