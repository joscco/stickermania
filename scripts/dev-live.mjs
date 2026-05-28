#!/usr/bin/env node
/**
 * Starts the editor/dev stack with hot reload:
 * - shared package in TypeScript watch mode
 * - backend in APP_MODE=dev with tsx watch
 * - Angular dev-tools frontend with HMR
 * - sticker sprite watch
 */
import {spawn} from "node:child_process";

const children = [];

function log(message) {
    console.log(`[dev] ${message}`);
}

function run(label, command, args, env = {}) {
    const child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: "inherit",
        shell: true,
        env: {...process.env, ...env},
    });

    children.push({label, child});

    child.on("close", (code) => {
        if (shuttingDown) return;
        log(`${label} exited with code ${code}`);
        shutdown(code ?? 0);
    });
}

let shuttingDown = false;

function shutdown(code = 0) {
    shuttingDown = true;
    for (const {child} of children) {
        child.kill("SIGINT");
    }
    process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

log("Building shared package once before watchers start...");
const build = spawn("npm", ["run", "build", "-w", "@birthday/shared"], {
    cwd: process.cwd(),
    stdio: "inherit",
    shell: true,
});

build.on("close", (code) => {
    if (code !== 0) {
        process.exit(code ?? 1);
    }

    log("Starting editors/dev stack:");
    log("  Backend API  http://localhost:3001");
    log("  Editors      http://localhost:4200");
    log("  Catalog      http://localhost:4200/catalog");
    log("  Minigames    http://localhost:4200/minigame-editor");

    run("shared", "npm", ["run", "dev", "-w", "@birthday/shared"]);
    run("backend", "npm", ["run", "dev", "-w", "@birthday/backend"], {APP_MODE: "dev"});
    run("frontend", "npm", ["run", "dev", "-w", "@birthday/frontend"]);
    run("sprite", "npm", ["run", "sprite:watch", "-w", "@birthday/frontend"]);
});
