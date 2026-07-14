import fs from "node:fs";
import path from "node:path";
import type {StickerCatalogConfig} from "@stickermania/shared";
import type {BackendConfig} from "../../../config.js";
import {asEditableCatalog, type EditableStickerCatalog} from "./defaultStickerCatalogConfig.js";

export class DefaultStickerCatalogConfigStore {
    public constructor(
        private readonly backendConfig: BackendConfig,
        private readonly cwd = process.cwd(),
    ) {}

    public async read(): Promise<EditableStickerCatalog> {
        const source = await fs.promises.readFile(this.catalogDataPath(), "utf-8");
        return asEditableCatalog(this.parseCatalogData(source));
    }

    public async write(catalog: EditableStickerCatalog): Promise<void> {
        await fs.promises.writeFile(this.catalogDataPath(), this.renderCatalogData(catalog), "utf-8");
        this.backendConfig.gameConfig.stickerCollage.catalog = this.cloneCatalog(catalog);
    }

    private catalogDataPath(): string {
        return path.resolve(this.cwd, "packages/shared/src/defaultStickerCatalogData.ts");
    }

    private parseCatalogData(source: string): StickerCatalogConfig {
        const match = source.match(/export const DEFAULT_STICKER_CATALOG: StickerCatalogConfig = ([\s\S]*);\s*$/);
        if (!match) {
            throw new Error("Could not parse DEFAULT_STICKER_CATALOG from packages/shared/src/defaultStickerCatalogData.ts.");
        }
        return JSON.parse(match[1]) as StickerCatalogConfig;
    }

    private renderCatalogData(catalog: EditableStickerCatalog): string {
        return [
            "import type {StickerCatalogConfig} from \"./index.js\";",
            "",
            `export const DEFAULT_STICKER_CATALOG: StickerCatalogConfig = ${JSON.stringify(catalog, null, 2)};`,
            "",
        ].join("\n");
    }

    private cloneCatalog(catalog: StickerCatalogConfig): StickerCatalogConfig {
        return JSON.parse(JSON.stringify(catalog)) as StickerCatalogConfig;
    }
}
