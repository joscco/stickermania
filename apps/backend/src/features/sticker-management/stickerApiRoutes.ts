import type {FastifyInstance} from "fastify";
import type {StickerDefinition, StickerEditorData, StickerEditorUpload} from "@stickermania/shared";
import type {AssetRepository} from "../../infrastructure/assetRepository.js";
import type {SessionService} from "../session-management/sessionService.js";
import {isValidStickerEditorUpload} from "./stickerEditorData.js";

export async function registerStickerManagementApiRoutes(
    app: FastifyInstance,
    sessionService: SessionService,
    assetRepository: AssetRepository,
): Promise<void> {
    app.post<{
        Params: {id: string};
        Body: {
            playerId: string;
            stickerId: string;
            imageDataUrl: string;
            stickerName?: string;
            packId?: string;
            overlayBounds?: StickerDefinition["overlayBounds"];
            editorData?: StickerEditorUpload;
        };
    }>("/api/sessions/:id/sticker-image", async (request, reply) => {
        const sessionId = request.params.id;
        const {playerId, stickerId, imageDataUrl, stickerName, packId, overlayBounds, editorData: editorUpload} = request.body ?? {};

        if (!playerId || !stickerId || !imageDataUrl) {
            return reply.status(400).send({message: "Missing playerId, stickerId, or imageDataUrl"});
        }

        const state = await sessionService.loadState(sessionId);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }
        if (!state.players[playerId]) {
            return reply.status(404).send({message: "Player not found"});
        }
        if (editorUpload && !isValidStickerEditorUpload(editorUpload)) {
            return reply.status(400).send({message: "Invalid editorData"});
        }

        const playerName = state.players[playerId]?.name ?? "anonymous";
        const saved = await assetRepository.saveSticker({sessionId, playerId, playerName, stickerId, imageDataUrl});
        const createdAt = Date.now();
        const existingSticker = state.gameState.playerStickers[playerId]?.find(item => item.id === stickerId);
        const editorData = editorUpload
            ? await saveEditorData(assetRepository, sessionId, stickerId, editorUpload, createdAt)
            : existingSticker?.editorData;
        const sticker = {
            id: stickerId,
            name: stickerName?.trim() || undefined,
            ownerPlayerId: playerId,
            imageUrl: `${saved.publicUrl}?v=${createdAt}`,
            assetPath: saved.assetPath,
            createdAt,
            packId,
            ...(isValidOverlayBounds(overlayBounds) ? {overlayBounds} : {}),
            ...(editorData ? {editorData} : {}),
        };
        const updatedState = await sessionService.addCreatedSticker(sessionId, playerId, sticker);
        const savedSticker = updatedState?.gameState.playerStickers[playerId]?.find(item => item.id === stickerId) ?? sticker;

        return {ok: true, publicUrl: saved.publicUrl, assetPath: saved.assetPath, sticker: savedSticker};
    });

    app.post<{
        Params: {id: string};
        Body: {playerId: string; name: string};
    }>("/api/sessions/:id/sticker-packs", async (request, reply) => {
        const sessionId = request.params.id;
        const {playerId, name} = request.body ?? {};

        if (!playerId || !name?.trim()) {
            return reply.status(400).send({message: "Missing playerId or name"});
        }

        const pack = await sessionService.createPlayerStickerPack(sessionId, playerId, name);
        if (!pack) {
            return reply.status(404).send({message: "Session or player not found"});
        }

        return reply.status(201).send({ok: true, pack});
    });

    app.patch<{
        Params: {id: string; stickerId: string};
        Body: {playerId: string; packId?: string};
    }>("/api/sessions/:id/sticker-image/:stickerId/pack", async (request, reply) => {
        const sessionId = request.params.id;
        const stickerId = request.params.stickerId;
        const {playerId, packId} = request.body ?? {};

        if (!playerId) {
            return reply.status(400).send({message: "Missing playerId"});
        }

        const sticker = await sessionService.moveStickerToPack(sessionId, playerId, stickerId, packId);
        if (!sticker) {
            return reply.status(404).send({message: "Session, player, or sticker not found"});
        }

        return {ok: true, sticker};
    });

    app.delete<{
        Params: {id: string; packId: string};
        Body: {playerId: string};
    }>("/api/sessions/:id/sticker-packs/:packId", async (request, reply) => {
        const sessionId = request.params.id;
        const packId = request.params.packId;
        const {playerId} = request.body ?? {};

        if (!playerId) {
            return reply.status(400).send({message: "Missing playerId"});
        }

        const packs = await sessionService.deletePlayerStickerPack(sessionId, playerId, packId);
        if (!packs) {
            return reply.status(404).send({message: "Session, player, or pack not found"});
        }

        return {ok: true, packs};
    });

    app.delete<{
        Params: {id: string; stickerId: string};
        Body: {playerId: string};
    }>("/api/sessions/:id/sticker-image/:stickerId", async (request, reply) => {
        const sessionId = request.params.id;
        const stickerId = request.params.stickerId;
        const {playerId} = request.body ?? {};

        if (!playerId) {
            return reply.status(400).send({message: "Missing playerId"});
        }

        const state = await sessionService.loadState(sessionId);
        if (!state) {
            return reply.status(404).send({message: "Session not found"});
        }
        if (!state.players[playerId]) {
            return reply.status(404).send({message: "Player not found"});
        }

        const sticker = state.gameState.playerStickers[playerId]?.find(item => item.id === stickerId);
        if (!sticker) {
            return reply.status(404).send({message: "Sticker not found"});
        }

        await assetRepository.deleteSticker({assetPath: sticker.assetPath});
        if (sticker.editorData?.baseImageAssetPath) {
            await assetRepository.deleteSticker({assetPath: sticker.editorData.baseImageAssetPath});
        }
        if (sticker.editorData?.paintImageAssetPath) {
            await assetRepository.deleteSticker({assetPath: sticker.editorData.paintImageAssetPath});
        }
        const deletion = await sessionService.deleteSticker(sessionId, playerId, stickerId);
        if (!deletion) {
            return reply.status(404).send({message: "Sticker not found"});
        }

        return {ok: true, stickerId, removedBoardPlacementCount: deletion.removedBoardPlacementCount};
    });
}

async function saveEditorData(
    assetRepository: AssetRepository,
    sessionId: string,
    stickerId: string,
    upload: StickerEditorUpload,
    revision: number,
): Promise<StickerEditorData> {
    const [base, paint] = await Promise.all([
        assetRepository.saveStickerLayer({sessionId, stickerId, layer: "base", imageDataUrl: upload.baseImageDataUrl}),
        assetRepository.saveStickerLayer({sessionId, stickerId, layer: "paint", imageDataUrl: upload.paintImageDataUrl}),
    ]);
    return {
        version: 2,
        baseImageUrl: `${base.publicUrl}?v=${revision}`,
        paintImageUrl: `${paint.publicUrl}?v=${revision}`,
        baseImageAssetPath: base.assetPath,
        paintImageAssetPath: paint.assetPath,
        workspace: {...upload.workspace},
        outlineWidth: upload.outlineWidth,
        ...(upload.textBox ? {textBox: {...upload.textBox}} : {}),
    };
}

function isValidOverlayBounds(bounds: StickerDefinition["overlayBounds"] | undefined): bounds is NonNullable<StickerDefinition["overlayBounds"]> {
    return !!bounds
        && Number.isFinite(bounds.x)
        && Number.isFinite(bounds.y)
        && Number.isFinite(bounds.w)
        && Number.isFinite(bounds.h)
        && bounds.w > 0
        && bounds.h > 0;
}
