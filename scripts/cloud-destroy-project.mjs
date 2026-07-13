#!/usr/bin/env node
import {execSync} from "node:child_process";
import readline from "node:readline/promises";
import {stdin as input, stdout as output} from "node:process";
import {getCloudConfig} from "./cloud-config.mjs";

const config = getCloudConfig();

function run(command) {
  console.log(`\n$ ${command}`);
  execSync(command, {stdio: "inherit"});
}

function canRun(command) {
  try {
    execSync(command, {stdio: "ignore"});
    return true;
  } catch {
    return false;
  }
}

function runIfExists(label, describeCommand, deleteCommand) {
  if (!canRun(describeCommand)) {
    console.log(`[cloud-destroy] ${label}: not found, skipping.`);
    return;
  }
  run(deleteCommand);
}

const rl = readline.createInterface({input, output});

console.log("This will delete billable app data/resources, but it will NOT delete the Google Cloud project.");
console.log(`Project: ${config.project}`);
console.log(`Region: ${config.region}`);
console.log("");
console.log("Will delete:");
console.log(`- Cloud Run service: ${config.service}`);
console.log(`- Firestore database: (default)`);
console.log(`- Cloud Storage bucket: gs://${config.assetBucket}`);
console.log(`- Artifact Registry repository: ${config.artifactRepository}`);
console.log("");
console.log("Will not intentionally delete:");
console.log("- the Google Cloud project itself");
console.log("- DNS records / custom-domain setup outside those resources");

const answer = await rl.question(`Type DELETE CLOUD RESOURCES ${config.project} to continue: `);
rl.close();

if (answer.trim() !== `DELETE CLOUD RESOURCES ${config.project}`) {
  console.log("Aborted.");
  process.exit(1);
}

runIfExists(
  "Cloud Run service",
  `gcloud run services describe ${config.service} --region ${config.region} --project ${config.project}`,
  `gcloud run services delete ${config.service} --region ${config.region} --project ${config.project} --quiet`,
);

runIfExists(
  "Firestore database",
  `gcloud firestore databases describe --database="(default)" --project ${config.project}`,
  `gcloud firestore databases delete --database="(default)" --project ${config.project} --quiet`,
);

runIfExists(
  "Cloud Storage bucket",
  `gcloud storage buckets describe gs://${config.assetBucket} --project ${config.project}`,
  `gcloud storage rm -r gs://${config.assetBucket} --project ${config.project} --quiet`,
);

runIfExists(
  "Artifact Registry repository",
  `gcloud artifacts repositories describe ${config.artifactRepository} --location ${config.region} --project ${config.project}`,
  `gcloud artifacts repositories delete ${config.artifactRepository} --location ${config.region} --project ${config.project} --quiet`,
);

console.log("\nBillable app resources deleted. The project remains available for a later redeploy.");
