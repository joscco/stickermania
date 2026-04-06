#!/usr/bin/env node

/**
 * Validates that every sticker referenced in the backend catalog
 * has a corresponding image file in the frontend assets directory.
 *
 * Usage:  node scripts/check-sticker-assets.mjs
 * Called automatically before `ng build` via the prebuild npm script.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── 1. Parse the sticker catalog source file ─────────────────────

const catalogPath = resolve(
  __dirname,
  "../../backend/src/game-modes/sticker-collage/stickerCatalog.ts",
);

if (!existsSync(catalogPath)) {
  console.error(`❌  Sticker catalog not found: ${catalogPath}`);
  process.exit(1);
}

const catalogSource = readFileSync(catalogPath, "utf-8");

// Extract all imageUrl values:  imageUrl: "assets/stickers/foo.png"
const imageUrlRegex = /imageUrl:\s*"([^"]+)"/g;
const expectedPaths = [];
let match;
while ((match = imageUrlRegex.exec(catalogSource)) !== null) {
  expectedPaths.push(match[1]);
}

if (expectedPaths.length === 0) {
  console.error("❌  No sticker imageUrls found in catalog. Is the file format correct?");
  process.exit(1);
}

// ── 2. Check each path against the public assets directory ───────

const publicDir = resolve(__dirname, "../public");
const missing = [];
const found = [];

for (const relPath of expectedPaths) {
  const fullPath = resolve(publicDir, relPath);
  if (existsSync(fullPath)) {
    found.push(relPath);
  } else {
    missing.push(relPath);
  }
}

// ── 3. Report ────────────────────────────────────────────────────

console.log(`\n🧩  Sticker Asset Check`);
console.log(`   Catalog entries:  ${expectedPaths.length}`);
console.log(`   Found:            ${found.length}`);
console.log(`   Missing:          ${missing.length}\n`);

if (missing.length > 0) {
  console.error("❌  Missing sticker assets:\n");
  for (const p of missing) {
    console.error(`   • ${p}`);
  }
  console.error(
    `\n   Place the missing PNGs in: apps/frontend/public/assets/stickers/\n`,
  );
  process.exit(1);
}

console.log("✅  All sticker assets present.\n");

