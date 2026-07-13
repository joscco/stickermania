import type {StickerCatalogConfig} from "@birthday/shared";
import {buildStickerCatalog, buildStickerPacks} from "@birthday/shared/sessionState";

/**
 * Builds the runtime StickerDefinition array from the catalog config.
 */
export const buildCatalog = buildStickerCatalog;

/**
 * Builds the runtime StickerPack array from the catalog config.
 */
export const buildPacks = buildStickerPacks satisfies (config: StickerCatalogConfig) => ReturnType<typeof buildStickerPacks>;
