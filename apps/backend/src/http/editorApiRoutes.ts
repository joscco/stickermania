import fs from "node:fs";
import path from "node:path";
import type {FastifyInstance} from "fastify";
import type {BackendConfig} from "../config.js";

type HitboxEntry = {
    polygon: Array<{x: number; y: number}>;
    overlayBounds?: {x: number; y: number; w: number; h: number};
};

export async function registerEditorApiRoutes(
    app: FastifyInstance,
    backendConfig: BackendConfig,
): Promise<void> {

    const hitboxDataPath = path.resolve(backendConfig.dataRoot, "..", "hitbox-data.json");

    function loadHitboxData(): Record<string, HitboxEntry> {
        try {
            const raw = JSON.parse(fs.readFileSync(hitboxDataPath, "utf-8"));
            const result: Record<string, HitboxEntry> = {};
            for (const [id, value] of Object.entries(raw)) {
                if (Array.isArray(value)) {
                    result[id] = {polygon: value as HitboxEntry['polygon']};
                } else if (typeof value === 'object' && value !== null) {
                    const v = value as any;
                    result[id] = {
                        polygon: Array.isArray(v.polygon) ? v.polygon : [],
                        overlayBounds: v.overlayBounds ?? undefined,
                    };
                }
            }
            return result;
        } catch {
            return {};
        }
    }

    function saveHitboxData(data: Record<string, HitboxEntry>): void {
        fs.writeFileSync(hitboxDataPath, JSON.stringify(data, null, 2), "utf-8");
    }

    app.get("/api/hitbox-data", async () => {
        return loadHitboxData();
    });

    app.put<{Params: {stickerId: string}; Body: {polygon?: Array<{x: number; y: number}>; overlayBounds?: {x: number; y: number; w: number; h: number} | null}}>(
        "/api/hitbox-data/:stickerId",
        async (request, reply) => {
            const stickerId = request.params.stickerId;
            const body = request.body ?? {};
            const polygon = body.polygon;
            const overlayBounds = body.overlayBounds;

            const data = loadHitboxData();

            if (!Array.isArray(polygon) || polygon.length < 3) {
                delete data[stickerId];
                saveHitboxData(data);
                return {ok: true, stickerId, cleared: true};
            }

            const entry: HitboxEntry = {
                polygon: polygon.map(p => ({
                    x: Math.round((p.x ?? 0) * 100) / 100,
                    y: Math.round((p.y ?? 0) * 100) / 100,
                })),
            };
            if (overlayBounds && overlayBounds.w > 0) {
                entry.overlayBounds = overlayBounds;
            }
            data[stickerId] = entry;
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

    // ─── Game Config Task Management ─────────────────────────────────

    const configPath = path.resolve(backendConfig.dataRoot, "..", "minigame.config.json");

    // ═══ SVG Sprite ID Listing ═══════════════════════════════════════

    app.get("/api/sprite-ids", async () => {
        const svgDir = path.resolve(backendConfig.dataRoot, "..", "apps", "frontend", "public", "assets", "svg");
        try {
            const files = fs.readdirSync(svgDir).filter(f => f.endsWith(".svg"));
            return files.map(f => ({
                id: f.replace(".svg", ""),
                spriteRef: `sprite:#${f.replace(".svg", "")}`,
            })).sort((a, b) => a.id.localeCompare(b.id));
        } catch {
            return [];
        }
    });

    // ═══ Minigame Config CRUD ═══════════════════════════════════════

    app.get("/api/game-config", async () => {
        try {
            const raw = fs.readFileSync(configPath, "utf-8");
            return JSON.parse(raw);
        } catch {
            return {tasks: []};
        }
    });

    app.get("/api/game-config/tasks", async () => {
        try {
            const raw = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(raw) as any;
            const tasks = config?.tasks ?? [];
            return tasks.map((t: any, i: number) => ({...t, _index: i}));
        } catch {
            return [];
        }
    });

    app.post<{Body: {task: import("@birthday/shared").MinigameTask}}>("/api/game-config/tasks", async (request, reply) => {
        try {
            const raw = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(raw) as any;
            if (!Array.isArray(config.tasks)) config.tasks = [];
            config.tasks.push(request.body.task);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
            return {ok: true, taskCount: config.tasks.length};
        } catch (err) {
            reply.status(500);
            return {error: String(err)};
        }
    });

    app.put<{Params: {index: string}; Body: {task: import("@birthday/shared").MinigameTask}}>("/api/game-config/tasks/:index", async (request, reply) => {
        try {
            const idx = parseInt(request.params.index, 10);
            const raw = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(raw) as any;
            if (!config.tasks || idx < 0 || idx >= config.tasks.length) {
                reply.status(404);
                return {error: "Task not found"};
            }
            config.tasks[idx] = request.body.task;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
            return {ok: true, index: idx};
        } catch (err) {
            reply.status(500);
            return {error: String(err)};
        }
    });

    app.delete<{Params: {index: string}}>("/api/game-config/tasks/:index", async (request, reply) => {
        try {
            const idx = parseInt(request.params.index, 10);
            const raw = fs.readFileSync(configPath, "utf-8");
            const config = JSON.parse(raw) as any;
            if (!config.tasks || idx < 0 || idx >= config.tasks.length) {
                reply.status(404);
                return {error: "Task not found"};
            }
            config.tasks.splice(idx, 1);
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
            return {ok: true, taskCount: config.tasks.length};
        } catch (err) {
            reply.status(500);
            return {error: String(err)};
        }
    });
}
