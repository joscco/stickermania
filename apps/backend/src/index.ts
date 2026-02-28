import http from "node:http";
import path from "node:path";
import { loadBackendConfig } from "./config";
import { serveStatic } from "./http/static";
import { attachWebSocketServer } from "./ws/wsServer";
import { WorldStore } from "./world/worldStore";
import { loadWorldFromDisk } from "./world/persistence";
import { sanitizeWorldState } from "./world/validation";
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
  if (backendConfig.shouldServeStatic) {
    const distRootAbsolutePath: string = path.resolve(process.cwd(), "apps/frontend/dist");
    serveStatic({ request, response, distRootAbsolutePath });
    return;
  }

  response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  response.end("Birthday Sandbox Backend running. WebSocket at /ws");
});

attachWebSocketServer({ server, backendConfig, worldStore });

server.listen(backendConfig.port, () => {
  console.log(`[backend] listening on http://localhost:${backendConfig.port}`);
  console.log(`[backend] websocket: ws://localhost:${backendConfig.port}/ws`);
  console.log(`[backend] persist file: ${backendConfig.persistPath}`);
  if (backendConfig.shouldServeStatic) {
    console.log(`[backend] serving static frontend from apps/frontend/dist`);
  }
});