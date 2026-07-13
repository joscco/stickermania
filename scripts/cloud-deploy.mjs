#!/usr/bin/env node
/**
 * Builds the Docker image locally and deploys to Cloud Run.
 * No Cloud Build needed — saves money and is faster for iterative deploys.
 *
 * Requirements: Docker Desktop running locally.
 * Called via: npm run cloud:deploy
 */

import path from "node:path";
import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {unlinkSync} from "node:fs";
import {getCloudConfig, requireCloudAdminPassword, writeCloudEnvFile} from "./cloud-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ─── Config ─────────────────────────────────────────────────────────────────

const config = getCloudConfig();
requireCloudAdminPassword(config.adminPassword);

// ─── Step 1: Authenticate Docker with Artifact Registry ─────────────────────

console.log("\n[cloud-deploy] Configuring Docker auth for Artifact Registry...\n");
run(`gcloud auth configure-docker ${config.region}-docker.pkg.dev --quiet --project ${config.project}`);
ensureArtifactRepository();

// ─── Step 2: Ensure Cloud persistence services ──────────────────────────────

console.log("\n[cloud-deploy] Ensuring Firestore + Cloud Storage are available...\n");
run(`gcloud services enable firestore.googleapis.com storage.googleapis.com --project ${config.project}`);
ensureFirestoreDatabase();
ensureAssetBucket();

// ─── Step 3: Build image locally (linux/amd64 for Cloud Run) ────────────────

console.log("\n[cloud-deploy] Building image locally (linux/amd64)...\n");
run(`docker build --platform linux/amd64 --build-arg FRONTEND_BUILD_SCRIPT=build:cloud -t ${config.image} .`);

// ─── Step 4: Push to Artifact Registry ──────────────────────────────────────

console.log("\n[cloud-deploy] Pushing image to Artifact Registry...\n");
run(`docker push ${config.image}`);

// ─── Step 5: Deploy to Cloud Run ────────────────────────────────────────────

const envFile = writeCloudEnvFile(config);

console.log("\n[cloud-deploy] Deploying to Cloud Run...\n");
try {
    run(
        `gcloud run deploy ${config.service}` +
        ` --image ${config.image}` +
        ` --region ${config.region}` +
        ` --project ${config.project}` +
        ` --allow-unauthenticated` +
        ` --ingress all` +
        ` --timeout 3600` +
        ` --max-instances ${config.maxInstances}` +
        ` --concurrency ${config.concurrency}` +
        ` --min-instances 0` +
        ` --cpu ${config.cpu}` +
        ` --memory ${config.memory}` +
        ` --port 8080` +
        ` --env-vars-file ${envFile}`,
        `gcloud run deploy ${config.service} ... --env-vars-file <temporary-redacted-file>`,
    );
} finally {
    unlinkSync(envFile);
}

console.log("\n[cloud-deploy] Deploy complete.");
console.log("[cloud-deploy] Board password set from ADMIN_PASSWORD.");

// ─── Helpers ─────────────────────────────────────────────────────────────────

function run(cmd, displayCmd = cmd) {
    console.log(`$ ${displayCmd}\n`);
    execSync(cmd, {stdio: "inherit", cwd: root});
}

function canRun(cmd) {
    try {
        execSync(cmd, {stdio: "ignore", cwd: root});
        return true;
    } catch {
        return false;
    }
}

function ensureFirestoreDatabase() {
    const describeCmd = `gcloud firestore databases describe --database="(default)" --project ${config.project}`;
    if (canRun(describeCmd)) {
        console.log("[cloud-deploy]    Firestore database already exists.");
        return;
    }
    run(`gcloud firestore databases create --database="(default)" --location=eur3 --project ${config.project}`);
}

function ensureAssetBucket() {
    const describeCmd = `gcloud storage buckets describe gs://${config.assetBucket} --project ${config.project}`;
    if (canRun(describeCmd)) {
        console.log(`[cloud-deploy]    Asset bucket gs://${config.assetBucket} already exists.`);
        return;
    }
    run(`gcloud storage buckets create gs://${config.assetBucket} --project ${config.project} --location ${config.region} --uniform-bucket-level-access`);
}

function ensureArtifactRepository() {
    const describeCmd = `gcloud artifacts repositories describe ${config.artifactRepository} --location ${config.region} --project ${config.project}`;
    if (canRun(describeCmd)) {
        console.log(`[cloud-deploy]    Artifact Registry repository ${config.artifactRepository} already exists.`);
        return;
    }
    run(`gcloud artifacts repositories create ${config.artifactRepository} --repository-format=docker --location ${config.region} --project ${config.project} --description="Stickermania Docker images"`);
}
