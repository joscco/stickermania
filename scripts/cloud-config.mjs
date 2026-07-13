import {writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import path from "node:path";

export function getCloudConfig() {
  const project = readRequiredEnv(["GCP_PROJECT", "GOOGLE_CLOUD_PROJECT"]);
  const region = readOptionalEnv("CLOUD_REGION") || "europe-west1";
  const service = readOptionalEnv("CLOUD_RUN_SERVICE") || "stickermania";
  const artifactRepository = readOptionalEnv("ARTIFACT_REPOSITORY") || service;
  const assetBucket = readOptionalEnv("CLOUD_ASSET_BUCKET") || `${project}-${service}-assets`;
  const image = `${region}-docker.pkg.dev/${project}/${artifactRepository}/${service}:latest`;

  return {
    project,
    region,
    service,
    artifactRepository,
    assetBucket,
    image,
    maxInstances: readOptionalEnv("CLOUD_RUN_MAX_INSTANCES") || "1",
    cpu: readOptionalEnv("CLOUD_RUN_CPU") || "2",
    memory: readOptionalEnv("CLOUD_RUN_MEMORY") || "2Gi",
    concurrency: readOptionalEnv("CLOUD_RUN_CONCURRENCY") || "200",
    adminPassword: readOptionalEnv("ADMIN_PASSWORD") || "",
  };
}

export function requireCloudAdminPassword(adminPassword) {
  if (adminPassword || process.env.ALLOW_EMPTY_ADMIN_PASSWORD === "1") {
    return;
  }

  throw new Error(
    "ADMIN_PASSWORD is required for Cloud Run. Set ALLOW_EMPTY_ADMIN_PASSWORD=1 only for intentional public tests without board password.",
  );
}

export function writeCloudEnvFile(config) {
  const envFile = path.join(tmpdir(), `stickermania-cloud-env-${process.pid}-${Date.now()}.yaml`);
  const vars = {
    ADMIN_PASSWORD: config.adminPassword,
    SESSION_STORE: "firestore",
    ASSET_STORE: "gcs",
    GCP_PROJECT: config.project,
    FIRESTORE_COLLECTION: "sessions",
    CLOUD_ASSET_BUCKET: config.assetBucket,
  };

  writeFileSync(
    envFile,
    Object.entries(vars)
      .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
      .join("\n") + "\n",
    {mode: 0o600},
  );

  return envFile;
}

function readRequiredEnv(names) {
  const value = names.map(readOptionalEnv).find(Boolean);
  if (value) {
    return value;
  }

  throw new Error(`Missing required env var: ${names.join(" or ")}`);
}

function readOptionalEnv(name) {
  return process.env[name]?.trim() || "";
}
