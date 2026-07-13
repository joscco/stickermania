import {DEFAULT_STICKER_CATALOG} from "./defaultStickerCatalogData.js";
import type {GameConfig, StickerCatalogConfig, StickerBoardBoundsConfig} from "./index.js";

export interface StickermaniaAppConfig {
    runtime: {
        /** Default local HTTP port. Cloud Run still overrides this through PORT. */
        defaultPort: number;
    };
    session: {
        /** How long sessions are retained after creation when no longer actively used. */
        ttlHours: number;
        /** Number of digits players enter to join a session. */
        codeLength: number;
    };
    player: {
        /** Maximum display-name length accepted by backend and profile UI. */
        maxNameLength: number;
    };
    stickerPacks: {
        /** Maximum pack name length for player-created and DEV default packs. */
        maxNameLength: number;
    };
    defaultCatalog: {
        /** Maximum sanitized ID length for default stickers created through the DEV editor. */
        maxStickerIdLength: number;
        /** Maximum display-name length for default/player stickers. */
        maxStickerNameLength: number;
    };
    board: {
        /** Shared board coordinate system used by live board, player editor, labels, and static export. */
        bounds: StickerBoardBoundsConfig;
        /** Rendered base size of one board sticker before per-placement scale is applied. */
        stickerBaseSizePx: number;
        /** Pixel size of the repeated board dot-pattern tile. */
        dotPatternSizePx: number;
        /** Minimum zoom in read-only board mode. */
        viewMinZoom: number;
        /** Maximum zoom in read-only board mode. */
        viewMaxZoom: number;
        /** Minimum zoom in edit mode. */
        editMinZoom: number;
        /** Maximum zoom in edit mode. */
        editMaxZoom: number;
        /** Multiplier used when fitting the edit camera closer than the read-only camera. */
        editFitZoomMultiplier: number;
        /** Minimum per-sticker scale on the board editor. */
        minStickerScale: number;
        /** Maximum per-sticker scale on the board editor. */
        maxStickerScale: number;
    };
    placementCanvas: {
        /** Fallback rendered sticker size for generic placement canvases. */
        defaultStickerSizePx: number;
        /** Minimum scale for generic sticker placement interactions. */
        minStickerScale: number;
        /** Maximum scale for generic sticker placement interactions. */
        maxStickerScale: number;
    };
    stickers: {
        /** Maximum width or height of saved crop/paint sticker PNGs. */
        maxOutputSizePx: number;
        /** Size of the floating drag preview when moving stickers between packs. */
        dragPreviewSizePx: number;
        /** Maximum sanitized filename-part length for saved avatar/sticker assets. */
        maxAssetFilenamePartLength: number;
    };
    drawingCanvas: {
        /** Internal square canvas resolution for avatar drawing. */
        resolutionPx: number;
    };
    stickerCreator: {
        /** Minimum short side for paint workspaces so editing remains crisp. */
        paintWorkspaceMinShortSidePx: number;
        /** Maximum upscaling factor when a small sticker enters the paint editor. */
        paintSourceUpscaleLimit: number;
        /** Maximum long side for newly created paint workspaces before users expand the canvas. */
        paintWorkspaceInitialMaxLongSidePx: number;
        /** Extra transparent margin added when brush strokes approach the paint workspace edge. */
        paintWorkspaceExpandMarginPx: number;
        /** Hard cap for either paint workspace side to prevent runaway memory usage. */
        paintWorkspaceMaxSidePx: number;
    };
}

export const STICKERMANIA_CONFIG = {
    runtime: {
        defaultPort: 3001,
    },
    session: {
        ttlHours: 24,
        codeLength: 4,
    },
    player: {
        maxNameLength: 24,
    },
    stickerPacks: {
        maxNameLength: 28,
    },
    defaultCatalog: {
        maxStickerIdLength: 80,
        maxStickerNameLength: 60,
    },
    board: {
        bounds: {
            minX: -2000,
            minY: -2000,
            maxX: 2000,
            maxY: 2000,
        },
        stickerBaseSizePx: 200,
        dotPatternSizePx: 100,
        viewMinZoom: 0.2,
        viewMaxZoom: 5,
        editMinZoom: 0.6,
        editMaxZoom: 5,
        editFitZoomMultiplier: 5,
        minStickerScale: 0.25,
        maxStickerScale: 1.5,
    },
    placementCanvas: {
        defaultStickerSizePx: 200,
        minStickerScale: 0.2,
        maxStickerScale: 4,
    },
    stickers: {
        maxOutputSizePx: 750,
        dragPreviewSizePx: 96,
        maxAssetFilenamePartLength: 60,
    },
    drawingCanvas: {
        resolutionPx: 400,
    },
    stickerCreator: {
        paintWorkspaceMinShortSidePx: 1280,
        paintSourceUpscaleLimit: 4,
        paintWorkspaceInitialMaxLongSidePx: 2048,
        paintWorkspaceExpandMarginPx: 96,
        paintWorkspaceMaxSidePx: 4096,
    },
} as const satisfies StickermaniaAppConfig;

export const DEFAULT_GAME_CONFIG: GameConfig = {
    port: STICKERMANIA_CONFIG.runtime.defaultPort,
    adminPassword: null,
    sessionTtlHours: STICKERMANIA_CONFIG.session.ttlHours,
    stickerCollage: {
        catalog: cloneStickerCatalog(DEFAULT_STICKER_CATALOG),
    },
};

export function createGameConfig(env: {PORT?: string; ADMIN_PASSWORD?: string} = {}): GameConfig {
    return {
        ...DEFAULT_GAME_CONFIG,
        port: parsePort(env.PORT),
        adminPassword: env.ADMIN_PASSWORD?.trim() || null,
        stickerCollage: {
            catalog: cloneStickerCatalog(DEFAULT_STICKER_CATALOG),
        },
    };
}

function parsePort(raw: string | undefined): number {
    if (!raw) return STICKERMANIA_CONFIG.runtime.defaultPort;
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : STICKERMANIA_CONFIG.runtime.defaultPort;
}

function cloneStickerCatalog(catalog: StickerCatalogConfig): StickerCatalogConfig {
    return JSON.parse(JSON.stringify(catalog)) as StickerCatalogConfig;
}
