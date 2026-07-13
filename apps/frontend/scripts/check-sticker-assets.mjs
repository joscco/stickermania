#!/usr/bin/env node
/**
 * check-sticker-assets.mjs
 *
 * Validates that every graphic referenced in the codebase actually exists.
 * Understands two URL formats:
 *
 *   sprite:#<id>    → checks that <symbol id="<id>"> exists in sprite.svg
 *   assets/png/…    → checks that the file exists in public/
 *
 * Checks:
 *   1. All sticker imageUrls in the backend catalog
 *   2. All <use href="assets/sprite.svg#…"> references in HTML templates
 *   3. All <img src="assets/…"> references in HTML templates (legacy PNGs)
 *
 * Usage:  node scripts/check-sticker-assets.mjs
 * Called automatically before `ng build` via the prebuild npm script.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '..');
const PUBLIC    = resolve(ROOT, 'public');
const SRC       = resolve(ROOT, 'src');
const SPRITE    = resolve(PUBLIC, 'assets/sprite.svg');

const DEFAULT_CATALOG_DATA = resolve(ROOT, '../../packages/shared/src/defaultStickerCatalogData.ts');

// ── 1. Parse sprite symbol IDs ────────────────────────────────────────────────

let spriteSymbolIds = new Set();

if (existsSync(SPRITE)) {
  const spriteContent = readFileSync(SPRITE, 'utf-8');
  const symbolRegex = /<symbol[^>]+id="([^"]+)"/g;
  let m;
  while ((m = symbolRegex.exec(spriteContent)) !== null) {
    spriteSymbolIds.add(m[1]);
  }
} else {
  console.warn(`⚠  Sprite file not found: ${SPRITE}`);
  console.warn(`   Run "npm run sprite" to generate it first.\n`);
}

// ── 2. Parse sticker catalog from shared runtime source ──────────────────────

const catalogImageUrls = [];

function loadDefaultCatalog(path) {
  try {
    const source = readFileSync(path, 'utf-8');
    const match = source.match(/export const DEFAULT_STICKER_CATALOG: StickerCatalogConfig = ([\s\S]*);\s*$/);
    return match ? JSON.parse(stripJsonTrailingCommas(match[1])) : null;
  } catch {
    return null;
  }
}

function stripJsonTrailingCommas(source) {
  return source.replace(/,(\s*[}\]])/g, '$1');
}

const catalogCfg = loadDefaultCatalog(DEFAULT_CATALOG_DATA);

// Explicit catalog of pack iconIds (declared here so the check is declarative)
const catalogPackIconIds = [];

if (catalogCfg?.packs) {
  for (const pack of catalogCfg.packs) {
    for (const sticker of pack.stickers ?? []) {
      if (typeof sticker === 'string') {
        catalogImageUrls.push({ url: `sprite:#sticker-${sticker}` });
      } else if (sticker?.imageUrl) {
        catalogImageUrls.push({ url: sticker.imageUrl });
      }
    }
    if (pack.iconId) {
      catalogPackIconIds.push({ id: pack.iconId, packId: pack.id });
    }
  }
} else {
  console.warn(`⚠  No catalog.packs found in shared default sticker catalog\n`);
}

// ── 3. Scan HTML templates for <use href="assets/sprite.svg#…"> ──────────────

function walkDir(dir, ext, results = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      walkDir(full, ext, results);
    } else if (entry.isFile() && extname(entry.name) === ext) {
      results.push(full);
    }
  }
  return results;
}

const htmlFiles = walkDir(SRC, '.html');
const tsFiles   = walkDir(SRC, '.ts');
const spriteUseRefs = [];   // { id, file }
const iconCompRefs  = [];   // { id, file }  – from <app-icon name="…" size="…">
const legacyImgRefs = [];   // { path, file }

// Scan both HTML and TS (inline templates) for references
const allTemplateFiles = [...htmlFiles, ...tsFiles];

for (const file of allTemplateFiles) {
  const content = readFileSync(file, 'utf-8');
  const relFile = file.replace(SRC + '/', '');

  // <use href="assets/sprite.svg#icon-trash">
  const useRe = /href="assets\/sprite\.svg#([^"]+)"/g;
  let m;
  while ((m = useRe.exec(content)) !== null) {
    spriteUseRefs.push({ id: m[1], file: relFile });
  }

  // <app-icon name="star" size="sm"/>  →  expects symbol "icon-star-sm" in sprite
  // First match the whole <app-icon …> tag, then extract name and size separately.
  const appIconRe = /<app-icon\b([^>]*?)\/?>/g;
  while ((m = appIconRe.exec(content)) !== null) {
    const attrs = m[1];
    const nameMatch = attrs.match(/\bname=["']([^"']+)["']/);
    const sizeMatch = attrs.match(/\bsize=["']([^"']+)["']/);
    if (nameMatch) {
      const name = nameMatch[1];
      const size = sizeMatch ? sizeMatch[1] : 'md'; // default in IconComponent
      iconCompRefs.push({ id: `icon-${name}-${size}`, file: relFile });
    }
  }

  // <img src="assets/png/..."> – legacy static refs
  const imgRe = /(?:src|href)=["'](?!assets\/sprite\.svg)(assets\/[^"']+)["']/g;
  while ((m = imgRe.exec(content)) !== null) {
    if (!m[1].startsWith('http') && !m[1].startsWith('data:')) {
      legacyImgRefs.push({ path: m[1], file: relFile });
    }
  }
}

// ── 4. Validate everything ────────────────────────────────────────────────────

let errors = 0;
let warnings = 0;

function check(label, items) {
  const missing = items.filter(i => i.missing);
  if (missing.length === 0) {
    console.log(`  ✓  ${label}: all ${items.length} OK`);
  } else {
    console.error(`  ✗  ${label}: ${missing.length} missing out of ${items.length}`);
    for (const i of missing) {
      const where = i.file ? ` (${i.file})` : '';
      console.error(`       • ${i.ref}${where}`);
    }
    errors += missing.length;
  }
}

// Pack iconId references (from catalog, checked against sprite)
const packIconChecked = catalogPackIconIds.map(({ id, packId }) => ({
  ref: `#${id}`,
  file: `default catalog (pack: ${packId})`,
  missing: spriteSymbolIds.size > 0 && !spriteSymbolIds.has(id),
}));

// Catalog entries
const catalogChecked = catalogImageUrls.map(({ url }) => {
  if (url.startsWith('sprite:#')) {
    const id = url.replace('sprite:#', '');
    return { ref: url, missing: spriteSymbolIds.size > 0 && !spriteSymbolIds.has(id) };
  } else {
    return { ref: url, missing: !existsSync(resolve(PUBLIC, url.replace(/^\//, '').split('?')[0])) };
  }
});

// HTML <use> references (deduplicated by id)
const useChecked = spriteUseRefs
  .filter((v, i, a) => a.findIndex(x => x.id === v.id) === i)
  .map(({ id, file }) => ({
    ref: `#${id}`,
    file,
    missing: spriteSymbolIds.size > 0 && !spriteSymbolIds.has(id),
  }));

// Legacy img src references (deduplicated)
const imgChecked = legacyImgRefs
  .filter((v, i, a) => a.findIndex(x => x.path === v.path) === i)
  .map(({ path, file }) => ({
    ref: path,
    file,
    missing: !existsSync(resolve(PUBLIC, path)),
  }));

// ── 5. Report ─────────────────────────────────────────────────────────────────

console.log('\n🧩  Asset Check\n');

if (spriteSymbolIds.size > 0) {
  console.log(`  📦 Sprite symbols available: ${spriteSymbolIds.size}`);
} else {
  console.warn(`  ⚠  Sprite not built yet — symbol checks skipped`);
  warnings++;
}

console.log('');
check('Catalog sticker imageUrls',   catalogChecked);
check('Catalog pack iconIds',        packIconChecked);
check('HTML <use> sprite refs',     useChecked);

if (imgChecked.length > 0) {
  check('HTML legacy img/href refs',  imgChecked);
}

console.log('');
if (errors > 0) {
  console.error(`❌  ${errors} missing asset(s) found.\n`);
  process.exit(1);
} else if (warnings > 0) {
  console.warn(`⚠  Check completed with warnings.\n`);
} else {
  console.log(`✅  All assets present.\n`);
}
