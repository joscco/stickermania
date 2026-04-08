#!/usr/bin/env node
/**
 * Generates a WLAN QR code PNG from wlan-config.json.
 *
 * Usage:
 *   npm run wlan:qr
 *
 * Output: wlan-qr.png (gitignored, not committed)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const configPath = path.join(root, "wlan", "wlan-config.json");
if (!fs.existsSync(configPath)) {
  console.error(`[wlan-qr] wlan-config.json not found at ${configPath}`);
  console.error(`[wlan-qr] Copy wlan-config.example.json to wlan-config.json and fill in your WiFi credentials.`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
const wifi = config.wifi;

if (!wifi?.ssid) {
  console.error("[wlan-qr] wlan-config.json is missing wifi.ssid");
  process.exit(1);
}

const ssid = wifi.ssid;
const password = wifi.password ?? "";
const security = wifi.security ?? "WPA";
const hidden = wifi.hidden === true;

function escapeWifi(value) {
  return value.replace(/([\\;,:"{}])/g, "\\$1");
}

const payload =
  `WIFI:T:${security};S:${escapeWifi(ssid)};` +
  `P:${escapeWifi(security === "nopass" ? "" : password)};` +
  `H:${hidden ? "true" : "false"};;`;

const outPath = path.join(root, "wlan", "wlan-qr.png");

await QRCode.toFile(outPath, payload, {
  type: "png",
  margin: 2,
  scale: 10,
  errorCorrectionLevel: "M",
});

console.log(`[wlan-qr] QR code saved to ${outPath}`);
console.log(`[wlan-qr] Network: ${ssid}`);

