#!/usr/bin/env node
/**
 * Startet Backend + Frontend im Dev-Live-Modus.
 * Wartet, bis das Backend auf Port 3001 antwortet, bevor der Frontend-Server startet.
 * Das verhindert 504 Proxy-Timeout-Fehler im Browser.
 */
import {spawn, exec} from "node:child_process";
import {createConnection} from "node:net";

const BACKEND_PORT = 3001;
const MAX_WAIT_MS = 60000;
const POLL_INTERVAL_MS = 500;

function log(msg) {
    console.log(`[dev:live] ${msg}`);
}

function run(cmd, opts = {}) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, {shell: true, stdio: "inherit", ...opts});
        p.on("close", (code) => {
            if (code === 0) resolve(code);
            else reject(new Error(`Command failed with code ${code}: ${cmd}`));
        });
    });
}

async function waitForBackend() {
    const start = Date.now();
    while (Date.now() - start < MAX_WAIT_MS) {
        try {
            await new Promise((resolve, reject) => {
                const sock = createConnection(BACKEND_PORT, "127.0.0.1");
                sock.on("connect", () => {
                    sock.destroy();
                    resolve(undefined);
                });
                sock.on("error", reject);
            });
            return true;
        } catch {
            await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
        }
    }
    return false;
}

async function main() {
    console.log("\n========================================");
    console.log("  Starting dev:live...");
    console.log("  Step 1: Build shared package");
    console.log("  Step 2: Build & start backend");
    console.log("  Step 3: Wait for backend ready");
    console.log("  Step 4: Start frontend dev server");
    console.log("========================================\n");

    try {
        log("Building shared package...");
        await run("npm run _build:shared", {cwd: process.cwd()});

        log("Building backend...");
        await run("npm run build -w @birthday/backend", {cwd: process.cwd()});

        log("Starting backend...");
        const backend = spawn("node", ["apps/backend/dist/index.js"], {
            cwd: process.cwd(),
            stdio: "inherit",
            env: {...process.env},
        });

        log("Waiting for backend on port 3001...");
        const ready = await waitForBackend();
        if (!ready) {
            log("ERROR: Backend did not start within 60s");
            backend.kill();
            process.exit(1);
        }
        log("Backend is ready!");

        log("Starting frontend dev server (dev-tools)...");
        const frontend = spawn("npm", ["run", "dev:tools", "-w", "@birthday/frontend"], {
            cwd: process.cwd(),
            stdio: "inherit",
            shell: true,
        });

        console.log("\n========================================");
        console.log("  ALL SYSTEMS GO!");
        console.log("  Backend API → http://localhost:3001");
        console.log("  Frontend    → http://localhost:4200");
        console.log("  Catalog     → http://localhost:4200  (Dev Landing)");
        console.log("========================================\n");

        // Graceful shutdown
        process.on("SIGINT", () => {
            log("Shutting down...");
            backend.kill("SIGINT");
            frontend.kill("SIGINT");
            process.exit(0);
        });

        backend.on("close", (code) => {
            log(`Backend exited with code ${code}`);
            frontend.kill();
            process.exit(code ?? 0);
        });

        frontend.on("close", (code) => {
            log(`Frontend exited with code ${code}`);
            backend.kill();
            process.exit(code ?? 0);
        });
    } catch (err) {
        log(`ERROR: ${err.message}`);
        process.exit(1);
    }
}

main();
