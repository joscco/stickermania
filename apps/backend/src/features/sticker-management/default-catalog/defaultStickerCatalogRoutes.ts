import type {FastifyInstance} from "fastify";
import type {StickerEditorUpload} from "@birthday/shared";
import type {BackendConfig} from "../../../config.js";
import {isValidStickerEditorUpload} from "../stickerEditorData.js";
import {DefaultStickerCatalogEditor} from "./defaultStickerCatalogEditor.js";

function rejectUnlessDevMode(backendConfig: BackendConfig): {message: string} | null {
    return backendConfig.devMode
        ? null
        : {message: "Default sticker authoring is only available in DEV mode."};
}

export async function registerDefaultStickerCatalogRoutes(
    app: FastifyInstance,
    backendConfig: BackendConfig,
): Promise<void> {
    const editor = new DefaultStickerCatalogEditor(backendConfig);

    app.get("/api/sticker-catalog", async () => {
        return editor.stickerCatalog();
    });

    app.get("/api/sticker-packs", async () => {
        return editor.stickerPacks();
    });

    app.post<{
        Body: {stickerId?: string; imageDataUrl: string; stickerName?: string; packId?: string; editorData?: StickerEditorUpload};
    }>("/api/dev/default-stickers", async (request, reply) => {
        const devError = rejectUnlessDevMode(backendConfig);
        if (devError) {
            return reply.status(403).send(devError);
        }

        const imageDataUrl = request.body?.imageDataUrl;
        if (!imageDataUrl) {
            return reply.status(400).send({message: "Missing imageDataUrl"});
        }
        if (request.body?.editorData && !isValidStickerEditorUpload(request.body.editorData)) {
            return reply.status(400).send({message: "Invalid editorData"});
        }

        const result = await editor.createSticker({
            stickerId: request.body?.stickerId,
            imageDataUrl,
            stickerName: request.body?.stickerName,
            packId: request.body?.packId,
            editorData: request.body?.editorData,
        });

        return {
            ok: true,
            ...result,
        };
    });

    app.post<{
        Body: {name: string};
    }>("/api/dev/default-sticker-packs", async (request, reply) => {
        const devError = rejectUnlessDevMode(backendConfig);
        if (devError) {
            return reply.status(403).send(devError);
        }

        const result = await editor.createPack(request.body?.name);

        return {
            ok: true,
            ...result,
        };
    });

    app.patch<{
        Params: {stickerId: string};
        Body: {packId: string};
    }>("/api/dev/default-stickers/:stickerId/pack", async (request, reply) => {
        const devError = rejectUnlessDevMode(backendConfig);
        if (devError) {
            return reply.status(403).send(devError);
        }

        const result = await editor.moveStickerToPack(request.params.stickerId, request.body?.packId);
        if (!result) {
            return reply.status(404).send({message: "Sticker not found"});
        }

        return {
            ok: true,
            ...result,
        };
    });

    app.delete<{
        Params: {packId: string};
    }>("/api/dev/default-sticker-packs/:packId", async (request, reply) => {
        const devError = rejectUnlessDevMode(backendConfig);
        if (devError) {
            return reply.status(403).send(devError);
        }

        const result = await editor.deletePack(request.params.packId);
        if (result === "default-pack") {
            return reply.status(400).send({message: "Default pack cannot be deleted"});
        }
        if (!result) {
            return reply.status(404).send({message: "Pack not found"});
        }

        return {
            ok: true,
            ...result,
        };
    });

    app.delete<{
        Params: {stickerId: string};
    }>("/api/dev/default-stickers/:stickerId", async (request, reply) => {
        const devError = rejectUnlessDevMode(backendConfig);
        if (devError) {
            return reply.status(403).send(devError);
        }

        const result = await editor.deleteSticker(request.params.stickerId);
        if (result === "missing-id") {
            return reply.status(400).send({message: "Missing stickerId"});
        }

        return {
            ok: true,
            ...result,
        };
    });
}
