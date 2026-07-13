#!/usr/bin/env node
/**
 * Restores the game service on Cloud Run using the latest already pushed image.
 * This does not build or push Docker images. Use `npm run cloud:deploy` after
 * code changes or after `cloud:destroy-project` deleted Artifact Registry.
 */

import path from "node:path";
import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {unlinkSync} from "node:fs";
import {getCloudConfig, requireCloudAdminPassword, writeCloudEnvFile} from "./cloud-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config = getCloudConfig();
requireCloudAdminPassword(config.adminPassword);
const envFile = writeCloudEnvFile(config);

console.log("\n[cloud-start] Restoring game service from latest pushed image...\n");
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

console.log("\n[cloud-start] Game service restored.");
console.log("[cloud-start] If this failed because the image/repository was deleted, run: npm run cloud:deploy\n");

function run(cmd, displayCmd = cmd) {
  console.log(`$ ${displayCmd}\n`);
  execSync(cmd, {stdio: "inherit", cwd: root});
}
