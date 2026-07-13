#!/usr/bin/env node
/**
 * Makes the Cloud Run game service unreachable from the public internet.
 * This does not build or deploy a replacement image.
 */

import {execSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";
import {getCloudConfig} from "./cloud-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const config = getCloudConfig();

console.log("\n[cloud-stop] Restricting Cloud Run ingress and scaling idle instances to zero...\n");
run(
  `gcloud run services update ${config.service}` +
  ` --region ${config.region}` +
  ` --project ${config.project}` +
  ` --ingress internal` +
  ` --min-instances 0` +
  ` --max-instances ${config.maxInstances}`,
);

console.log("\n[cloud-stop] Removing public invoker binding if present...\n");
tryRun(
  `gcloud run services remove-iam-policy-binding ${config.service}` +
  ` --region ${config.region}` +
  ` --project ${config.project}` +
  ` --member=allUsers` +
  ` --role=roles/run.invoker`,
);

console.log("\n[cloud-stop] Game service is no longer publicly reachable.");
console.log("[cloud-stop] Run 'npm run cloud:start' to restore public access to the latest pushed game image.\n");

function run(cmd) {
  console.log(`$ ${cmd}\n`);
  execSync(cmd, {stdio: "inherit", cwd: root});
}

function tryRun(cmd) {
  console.log(`$ ${cmd}\n`);
  try {
    execSync(cmd, {stdio: "inherit", cwd: root});
  } catch {
    console.log("[cloud-stop] Public invoker binding was already absent or could not be removed.");
  }
}
