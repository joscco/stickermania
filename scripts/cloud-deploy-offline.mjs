#!/usr/bin/env node
/**
 * Builds the offline placeholder image locally and deploys it to Cloud Run.
 * This replaces the running game with a static "Stickermania ist offline" page.
 *
 * Usage: npm run cloud:deploy-offline
 * To restore the game: npm run cloud:deploy
 */

import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PROJECT        = "birthday-game-2026";
const REGION         = "europe-west1";
const SERVICE        = "birthday-game";
const OFFLINE_IMAGE  = `${REGION}-docker.pkg.dev/${PROJECT}/${SERVICE}/${SERVICE}-offline:latest`;

// ─── Step 1: Auth ────────────────────────────────────────────────────────────

console.log("\n[cloud-deploy-offline] 🔑  Configuring Docker auth…\n");
run(`gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet --project ${PROJECT}`);

// ─── Step 2: Build offline image locally ────────────────────────────────────

console.log("\n[cloud-deploy-offline] 🏗  Building offline image locally (linux/amd64)…\n");
run(`docker build --platform linux/amd64 -f Dockerfile.offline -t ${OFFLINE_IMAGE} .`);

// ─── Step 3: Push ────────────────────────────────────────────────────────────

console.log("\n[cloud-deploy-offline] 📤  Pushing offline image…\n");
run(`docker push ${OFFLINE_IMAGE}`);

// ─── Step 4: Deploy ──────────────────────────────────────────────────────────

console.log("\n[cloud-deploy-offline] 🚀  Deploying offline page to Cloud Run…\n");
run(
    `gcloud run deploy ${SERVICE}` +
    ` --image ${OFFLINE_IMAGE}` +
    ` --region ${REGION}` +
    ` --project ${PROJECT}` +
    ` --allow-unauthenticated` +
    ` --timeout 60` +
    ` --max-instances 1` +
    ` --min-instances 1` +
    ` --port 8080`,
);

console.log("\n[cloud-deploy-offline] ✅  Offline page is live.");
console.log("[cloud-deploy-offline]    Run 'npm run cloud:deploy' to restore the game.\n");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd) {
    console.log(`$ ${cmd}\n`);
    execSync(cmd, {stdio: "inherit", cwd: root});
}

