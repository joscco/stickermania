import type {StickerDefinition, StickerDefinitionConfig, StickerEditorData, StickerEditorUpload, StickerPack, StickerPackConfig} from "@stickermania/shared";
import type {BackendConfig} from "../../../config.js";
import {buildCatalog, buildPacks} from "../catalog/stickerCatalog.js";
import {DefaultStickerAssetStore, decodePngDataUrl} from "./defaultStickerAssetStore.js";
import {
    DEFAULT_PACK_ID,
    ensureDefaultPack,
    findPack,
    findPackContainingSticker,
    normalizePackName,
    normalizeStickerName,
    removeStickerFromAllPacks,
    safePackId,
    safeStickerId,
    stickerEntryId,
} from "./defaultStickerCatalogConfig.js";
import {DefaultStickerCatalogConfigStore} from "./defaultStickerCatalogConfigStore.js";

export type CreateDefaultStickerRequest = {
    stickerId?: string;
    imageDataUrl: string;
    stickerName?: string;
    packId?: string;
    editorData?: StickerEditorUpload;
};

export class DefaultStickerCatalogEditor {
    private readonly configStore: DefaultStickerCatalogConfigStore;
    private readonly assetStore: DefaultStickerAssetStore;

    public constructor(
        private readonly backendConfig: BackendConfig,
        cwd = process.cwd(),
    ) {
        this.configStore = new DefaultStickerCatalogConfigStore(backendConfig, cwd);
        this.assetStore = new DefaultStickerAssetStore(cwd);
    }

    public stickerCatalog(): ReturnType<typeof buildCatalog> {
        return buildCatalog(this.backendConfig.gameConfig.stickerCollage.catalog);
    }

    public stickerPacks(): StickerPack[] {
        return buildPacks(this.backendConfig.gameConfig.stickerCollage.catalog);
    }

    public async createSticker(request: CreateDefaultStickerRequest): Promise<{
        sticker: StickerDefinition;
        pack: StickerPack | undefined;
        packs: StickerPack[];
    }> {
        const createdAt = Date.now();
        const stickerId = safeStickerId(request.stickerId ?? `dev-default-${createdAt}`);
        const filename = `${stickerId}.png`;
        const stickerName = normalizeStickerName(request.stickerName);

        await this.assetStore.writeStickerAsset(filename, decodePngDataUrl(request.imageDataUrl));
        const imageUrl = `/assets/default-stickers/${filename}?v=${createdAt}`;
        const catalog = await this.configStore.read();
        const pack = this.resolveTargetPack(catalog, stickerId, request.packId);
        const existingEntry = findPackContainingSticker(catalog, stickerId)?.stickers
            .find(entry => stickerEntryId(entry) === stickerId);
        const existingEditorData = typeof existingEntry === "string" ? undefined : existingEntry?.editorData;
        const editorData = request.editorData
            ? await this.writeEditorData(stickerId, request.editorData, createdAt)
            : existingEditorData;
        const nextSticker: StickerDefinitionConfig = {
            id: stickerId,
            imageUrl,
            ...(stickerName ? {name: stickerName} : {}),
            ...(editorData ? {editorData} : {}),
        };

        removeStickerFromAllPacks(catalog, stickerId);
        pack.stickers = [...(Array.isArray(pack.stickers) ? pack.stickers : []), nextSticker];

        await this.configStore.write(catalog);
        const packs = this.stickerPacks();
        const sticker = this.stickerCatalog().find(item => item.id === stickerId);
        if (!sticker) {
            throw new Error(`Saved sticker ${stickerId} is missing from the catalog`);
        }

        return {
            sticker,
            pack: packs.find(item => item.id === pack.id),
            packs,
        };
    }

    public async createPack(rawName: unknown): Promise<{pack: StickerPack | undefined; packs: StickerPack[]}> {
        const name = normalizePackName(rawName);
        const createdAt = Date.now();
        const catalog = await this.configStore.read();
        ensureDefaultPack(catalog);

        const pack: StickerPackConfig = {
            id: `default-${safePackId(name)}-${createdAt.toString(36)}`,
            name,
            iconId: "image-stickers",
            stickers: [],
        };
        catalog.packs.push(pack);

        await this.configStore.write(catalog);
        const packs = this.stickerPacks();

        return {
            pack: packs.find(item => item.id === pack.id),
            packs,
        };
    }

    public async moveStickerToPack(stickerIdParam: string, packId: string | undefined): Promise<{
        sticker: ReturnType<typeof buildCatalog>[number] | undefined;
        pack: StickerPack | undefined;
        packs: StickerPack[];
    } | null> {
        const stickerId = safeStickerId(stickerIdParam);
        const catalog = await this.configStore.read();
        const targetPack = findPack(catalog, packId) ?? ensureDefaultPack(catalog);
        const sourcePack = findPackContainingSticker(catalog, stickerId);
        const sourceEntry = sourcePack?.stickers.find(entry => stickerEntryId(entry) === stickerId);

        if (!sourceEntry) {
            return null;
        }

        removeStickerFromAllPacks(catalog, stickerId);
        targetPack.stickers = [...(Array.isArray(targetPack.stickers) ? targetPack.stickers : []), sourceEntry];

        await this.configStore.write(catalog);
        const packs = this.stickerPacks();

        return {
            sticker: this.stickerCatalog().find(item => item.id === stickerId),
            pack: packs.find(item => item.id === targetPack.id),
            packs,
        };
    }

    public async deletePack(packId: string): Promise<{packs: StickerPack[]} | "default-pack" | null> {
        if (packId === DEFAULT_PACK_ID) {
            return "default-pack";
        }

        const catalog = await this.configStore.read();
        const defaultPack = ensureDefaultPack(catalog);
        const pack = findPack(catalog, packId);
        if (!pack) {
            return null;
        }

        defaultPack.stickers = [
            ...(Array.isArray(defaultPack.stickers) ? defaultPack.stickers : []),
            ...(Array.isArray(pack.stickers) ? pack.stickers : []),
        ];
        catalog.packs = catalog.packs
            .filter(item => item.id !== packId);

        await this.configStore.write(catalog);
        return {packs: this.stickerPacks()};
    }

    public async deleteSticker(stickerIdParam: string): Promise<{pack: StickerPack | undefined; packs: StickerPack[]} | "missing-id"> {
        const stickerId = safeStickerId(stickerIdParam);
        if (!stickerId) {
            return "missing-id";
        }

        const catalog = await this.configStore.read();
        ensureDefaultPack(catalog);
        removeStickerFromAllPacks(catalog, stickerId);

        await this.assetStore.deleteStickerAsset(stickerId);
        await this.configStore.write(catalog);

        return {
            pack: this.stickerPacks().find(item => item.id === DEFAULT_PACK_ID),
            packs: this.stickerPacks(),
        };
    }

    private resolveTargetPack(catalog: Parameters<typeof ensureDefaultPack>[0], stickerId: string, packId: string | undefined): StickerPackConfig {
        const defaultPack = ensureDefaultPack(catalog);
        const existingPack = findPackContainingSticker(catalog, stickerId);
        const requestedPack = findPack(catalog, packId);
        return requestedPack ?? existingPack ?? defaultPack;
    }

    private async writeEditorData(stickerId: string, upload: StickerEditorUpload, revision: number): Promise<StickerEditorData> {
        const baseFilename = `${stickerId}.base.png`;
        const paintFilename = `${stickerId}.paint.png`;
        await Promise.all([
            this.assetStore.writeStickerAsset(baseFilename, decodePngDataUrl(upload.baseImageDataUrl)),
            this.assetStore.writeStickerAsset(paintFilename, decodePngDataUrl(upload.paintImageDataUrl)),
        ]);
        return {
            version: 2,
            baseImageUrl: `/assets/default-stickers/${baseFilename}?v=${revision}`,
            paintImageUrl: `/assets/default-stickers/${paintFilename}?v=${revision}`,
            workspace: {...upload.workspace},
            outlineWidth: upload.outlineWidth,
            ...(upload.textBox ? {textBox: {...upload.textBox}} : {}),
        };
    }
}
