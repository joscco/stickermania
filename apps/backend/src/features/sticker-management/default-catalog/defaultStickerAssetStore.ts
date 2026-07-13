import fs from "node:fs";
import path from "node:path";

export class DefaultStickerAssetStore {
    public constructor(private readonly cwd = process.cwd()) {}

    public async writeStickerAsset(filename: string, imageBuffer: Buffer): Promise<void> {
        await fs.promises.mkdir(this.publicAssetDir(), {recursive: true});
        await fs.promises.writeFile(path.join(this.publicAssetDir(), filename), imageBuffer);

        for (const distDir of this.frontendDistAssetDirs()) {
            if (!fs.existsSync(path.dirname(distDir))) continue;
            await fs.promises.mkdir(distDir, {recursive: true});
            await fs.promises.writeFile(path.join(distDir, filename), imageBuffer);
        }
    }

    public async deleteStickerAsset(stickerId: string): Promise<void> {
        const filenames = [`${stickerId}.png`, `${stickerId}.base.png`, `${stickerId}.paint.png`];
        await Promise.all(filenames.map(filename => fs.promises.rm(path.resolve(this.publicAssetDir(), filename), {force: true})));
        for (const distDir of this.frontendDistAssetDirs()) {
            await Promise.all(filenames.map(filename => fs.promises.rm(path.join(distDir, filename), {force: true})));
        }
    }

    private publicAssetDir(): string {
        return path.resolve(this.cwd, "apps/frontend/public/assets/default-stickers");
    }

    private frontendDistAssetDirs(): string[] {
        return [
            path.resolve(this.cwd, "apps/frontend/dist/frontend/assets/default-stickers"),
            path.resolve(this.cwd, "apps/frontend/dist/frontend/browser/assets/default-stickers"),
        ];
    }
}

export function decodePngDataUrl(imageDataUrl: string): Buffer {
    const base64 = imageDataUrl.replace(/^data:image\/\w+;base64,/, "");
    return Buffer.from(base64, "base64");
}
