import fs from "node:fs";
import path from "node:path";
import type {FastifyInstance} from "fastify";
import type {StickerDefinition} from "@birthday/shared";
import type {BackendConfig} from "../config.js";
import {buildCatalog} from "../game-modes/sticker-collage/stickerCatalog.js";

/**
 * Editor-only API routes.
 * These are used by the hitbox editor and sticker editor test page.
 * Registered in both "party" and "dev" modes.
 */
export async function registerEditorApiRoutes(
    app: FastifyInstance,
    backendConfig: BackendConfig,
): Promise<void> {

    // ─── Hitbox data ────────────────────────────────────────────

    const hitboxDataPath = path.resolve(backendConfig.dataRoot, "..", "hitbox-data.json");

    function loadHitboxData(): Record<string, Array<{x: number; y: number}>> {
        try {
            return JSON.parse(fs.readFileSync(hitboxDataPath, "utf-8"));
        } catch {
            return {};
        }
    }

    function saveHitboxData(data: Record<string, Array<{x: number; y: number}>>): void {
        fs.writeFileSync(hitboxDataPath, JSON.stringify(data, null, 2), "utf-8");
    }

    app.get("/api/hitbox-data", async () => {
        return loadHitboxData();
    });

    app.put<{Params: {stickerId: string}; Body: {polygon: Array<{x: number; y: number}>}}>(
        "/api/hitbox-data/:stickerId",
        async (request, reply) => {
            const stickerId = request.params.stickerId;
            const polygon = request.body?.polygon;
            if (!Array.isArray(polygon)) {
                return reply.status(400).send({message: "polygon must be an array"});
            }

            const data = loadHitboxData();
            if (polygon.length < 3) {
                delete data[stickerId];
            } else {
                data[stickerId] = polygon.map(p => ({
                    x: Math.round((p.x ?? 0) * 100) / 100,
                    y: Math.round((p.y ?? 0) * 100) / 100,
                }));
            }
            saveHitboxData(data);
            return {ok: true, stickerId, pointCount: polygon.length};
        },
    );

    app.delete<{Params: {stickerId: string}}>("/api/hitbox-data/:stickerId", async (request) => {
        const data = loadHitboxData();
        delete data[request.params.stickerId];
        saveHitboxData(data);
        return {ok: true};
    });

    // ─── Sticker catalog ────────────────────────────────────────

    app.get("/api/sticker-catalog", async () => {
        const hitboxData = loadHitboxData();
        const catalog = buildCatalog(backendConfig.gameConfig.stickerCollage.catalog);
        return catalog.map((sticker): StickerDefinition => {
            const polygon = hitboxData[sticker.id];
            if (polygon && Array.isArray(polygon) && polygon.length >= 3) {
                return {...sticker, hitboxPolygon: polygon};
            }
            return sticker;
        });
    });
}

