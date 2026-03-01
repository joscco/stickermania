import fs from "node:fs";
import path from "node:path";

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9äöüÄÖÜß_-]/g, "_").slice(0, 60);
}

/**
 * Save a drawing (data URL) as a PNG file on disk.
 * Directory: {basePath}/{playerName}/{prompt}_{shortId}.png
 */
export async function saveDrawingToDisk(args: {
  basePath: string;
  playerName: string;
  prompt: string;
  drawingId: string;
  imageDataUrl: string;
}): Promise<string> {
  const playerDir = path.resolve(args.basePath, sanitize(args.playerName));
  await fs.promises.mkdir(playerDir, { recursive: true });

  const shortId = args.drawingId.slice(0, 8);
  const fileName = `${sanitize(args.prompt)}_${shortId}.png`;
  const filePath = path.join(playerDir, fileName);

  // Strip data URL prefix
  const base64 = args.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  await fs.promises.writeFile(filePath, buffer);

  return filePath;
}

/**
 * Save an avatar (data URL) as a PNG file on disk.
 * File: {basePath}/_avatars/{playerName}.png
 */
export async function saveAvatarToDisk(args: {
  basePath: string;
  playerName: string;
  imageDataUrl: string;
}): Promise<string> {
  const avatarDir = path.resolve(args.basePath, "_avatare");
  await fs.promises.mkdir(avatarDir, { recursive: true });

  const fileName = `${sanitize(args.playerName)}.png`;
  const filePath = path.join(avatarDir, fileName);

  const base64 = args.imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64, "base64");
  await fs.promises.writeFile(filePath, buffer);

  return filePath;
}

