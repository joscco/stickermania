#!/usr/bin/env node
/**
 * Builds the Docker image locally and deploys to Cloud Run.
 * No Cloud Build needed — saves money and is faster for iterative deploys.
 *
 * Requirements: Docker Desktop running locally.
 * Called via: npm run cloud:deploy
 */

import fs from "node:fs";
import path from "node:path";
import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Read adminPassword from local game.config.json ─────────────────────────

const configPath = path.join(root, "game.config.json");
if (!fs.existsSync(configPath)) {
    console.error(`[cloud-deploy] game.config.json not found at ${configPath}`);
    console.error(`[cloud-deploy] Run: cp game.config.example.json game.config.json`);
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const adminPassword = config.adminPassword ?? null;

if (!adminPassword) {
    console.warn("[cloud-deploy] ⚠️  adminPassword is not set in game.config.json — board will be accessible without a password.");
}

// ─── Config ─────────────────────────────────────────────────────────────────

const PROJECT   = "birthday-game-2026";
const REGION    = "europe-west1";
const SERVICE   = "birthday-game";
const IMAGE     = `${REGION}-docker.pkg.dev/${PROJECT}/${SERVICE}/${SERVICE}:latest`;

// ─── Step 1: Authenticate Docker with Artifact Registry ─────────────────────

console.log("\n[cloud-deploy] 🔑  Configuring Docker auth for Artifact Registry…\n");
run(`gcloud auth configure-docker ${REGION}-docker.pkg.dev --quiet --project ${PROJECT}`);

// ─── Step 2: Build image locally (linux/amd64 for Cloud Run) ────────────────

console.log("\n[cloud-deploy] 🏗  Building image locally (linux/amd64)…\n");
run(`docker build --platform linux/amd64 -t ${IMAGE} .`);

// ─── Step 3: Push to Artifact Registry ──────────────────────────────────────

console.log("\n[cloud-deploy] 📤  Pushing image to Artifact Registry…\n");
run(`docker push ${IMAGE}`);

// ─── Step 4: Deploy to Cloud Run ────────────────────────────────────────────

const envVars = adminPassword
    ? `ADMIN_PASSWORD=${adminPassword},OFFLINE_MODE=false`
    : "ADMIN_PASSWORD=,OFFLINE_MODE=false";

console.log("\n[cloud-deploy] 🚀  Deploying to Cloud Run…\n");
run(
    `gcloud run deploy ${SERVICE}` +
    ` --image ${IMAGE}` +
    ` --region ${REGION}` +
    ` --project ${PROJECT}` +
    ` --allow-unauthenticated` +
    ` --timeout 3600` +
    ` --max-instances 1` +
    ` --min-instances 0` +
    ` --port 8080` +
    ` --set-env-vars ${envVars}`
);

console.log("\n[cloud-deploy] ✅  Deploy complete.");
if (adminPassword) {
    console.log(`[cloud-deploy]    Board password set from game.config.json.`);
} else {
    console.log(`[cloud-deploy]    No board password set — set adminPassword in game.config.json before next deploy.`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd) {
    console.log(`$ ${cmd}\n`);
    execSync(cmd, {stdio: "inherit", cwd: root});
}
