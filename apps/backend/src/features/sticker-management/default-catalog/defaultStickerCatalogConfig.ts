import type {StickerCatalogConfig, StickerConfigEntry, StickerPackConfig} from "@stickermania/shared";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";

export const DEFAULT_PACK_ID = "default";
export const DEFAULT_PACK_NAME = "Default";

export type EditableStickerCatalog = StickerCatalogConfig;

export function safeStickerId(raw: string): string {
    return raw
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, STICKERMANIA_CONFIG.defaultCatalog.maxStickerIdLength);
}

export function normalizeStickerName(raw: unknown): string | undefined {
    if (typeof raw !== "string") return undefined;
    const value = raw.trim().slice(0, STICKERMANIA_CONFIG.defaultCatalog.maxStickerNameLength);
    return value.length > 0 ? value : undefined;
}

export function normalizePackName(raw: unknown): string {
    const value = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ").slice(0, STICKERMANIA_CONFIG.stickerPacks.maxNameLength) : "";
    return value || "Neues Pack";
}

export function safePackId(raw: string): string {
    const safe = safeStickerId(raw.toLowerCase());
    return safe || "pack";
}

export function asEditableCatalog(rawCatalog: unknown): EditableStickerCatalog {
    const catalog = isRecord(rawCatalog) ? rawCatalog : {};
    if (!Array.isArray(catalog["packs"])) {
        catalog["packs"] = [];
    }
    return catalog as unknown as EditableStickerCatalog;
}

export function ensureDefaultPack(catalog: EditableStickerCatalog): StickerPackConfig {
    const packs = catalog.packs;
    const devPack = packs.find(item => item.id === "default_dev");
    const defaultPack = packs.find(item => item.id === DEFAULT_PACK_ID);
    const pack: StickerPackConfig = defaultPack ?? {
        id: DEFAULT_PACK_ID,
        name: DEFAULT_PACK_NAME,
        iconId: "image-stickers",
        stickers: [],
    };

    pack.name = pack.name || DEFAULT_PACK_NAME;
    pack.iconId = pack.iconId || "image-stickers";
    pack.stickers = Array.isArray(pack.stickers) ? pack.stickers : [];

    if (!defaultPack) {
        packs.unshift(pack);
    }

    if (devPack && Array.isArray(devPack.stickers)) {
        const seen = new Set(pack.stickers.map(stickerEntryId).filter(id => id !== undefined));
        for (const entry of devPack.stickers) {
            const id = stickerEntryId(entry);
            if (typeof id === "string" && !seen.has(id)) {
                pack.stickers.push(entry);
                seen.add(id);
            }
        }
        catalog.packs = packs.filter(item => item.id !== "default_dev");
    }

    return pack;
}

export function stickerEntryId(entry: StickerConfigEntry): string | undefined {
    return typeof entry === "string" ? entry : entry.id;
}

export function removeStickerFromAllPacks(catalog: EditableStickerCatalog, stickerId: string): void {
    for (const pack of catalog.packs) {
        pack.stickers = Array.isArray(pack.stickers)
            ? pack.stickers.filter(entry => stickerEntryId(entry) !== stickerId)
            : [];
    }
}

export function findPackContainingSticker(catalog: EditableStickerCatalog, stickerId: string): StickerPackConfig | undefined {
    return catalog.packs
        .find(pack => Array.isArray(pack.stickers) && pack.stickers.some(entry => stickerEntryId(entry) === stickerId));
}

export function findPack(catalog: EditableStickerCatalog, packId: string | undefined): StickerPackConfig | undefined {
    return catalog.packs.find(pack => pack.id === packId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
