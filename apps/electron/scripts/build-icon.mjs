import fs from "node:fs";
import path from "node:path";
import png2icons from "png2icons";

const root = path.resolve(import.meta.dirname, "..");
const buildDir = path.join(root, "build");
const sourcePngPath = process.env.ELECTRON_ICON_SOURCE
  ? path.resolve(root, process.env.ELECTRON_ICON_SOURCE)
  : path.join(root, "assets", "icon-source.png");

const outputs = {
  png: path.join(buildDir, "icon.png"),
  ico: path.join(buildDir, "icon.ico"),
  icns: path.join(buildDir, "icon.icns"),
};

fs.mkdirSync(buildDir, {recursive: true});
removeLegacyIconOutputs();

if (!fs.existsSync(sourcePngPath)) {
  throw new Error(`Electron icon source not found: ${sourcePngPath}`);
}

const sourcePng = fs.readFileSync(sourcePngPath);
const icns = png2icons.createICNS(sourcePng, png2icons.BICUBIC, 0);
const ico = png2icons.createICO(sourcePng, png2icons.BICUBIC, 0, false, true);

if (!icns) {
  throw new Error(`Could not create macOS icon from ${sourcePngPath}`);
}

if (!ico) {
  throw new Error(`Could not create Windows icon from ${sourcePngPath}`);
}

fs.copyFileSync(sourcePngPath, outputs.png);
fs.writeFileSync(outputs.icns, icns);
fs.writeFileSync(outputs.ico, ico);

console.log(`Using Electron icon source: ${sourcePngPath}`);
console.log(`Electron icons written to ${buildDir}`);

function removeLegacyIconOutputs() {
  fs.rmSync(path.join(buildDir, "icon.iconset"), {recursive: true, force: true});

  for (const size of [16, 32, 48, 64, 128, 256, 512, 1024]) {
    fs.rmSync(path.join(buildDir, `icon-${size}.png`), {force: true});
  }
}
