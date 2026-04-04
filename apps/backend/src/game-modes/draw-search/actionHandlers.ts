import crypto from "node:crypto";
import type {
    DrawSearchDrawing,
    DrawSearchGameConfig,
    DrawSearchModeState,
    DrawSearchPlayerTask,
    DrawSearchServerEvent,
    SessionState,
} from "@birthday/shared";
import type {AssetRepository} from "../../infra/assetRepository.js";
import type {GameActionContext, GameActionResult} from "../gameModeEngine.js";
import {pickNextTask} from "./taskPicker.js";

/**
 * Resolve the next task for a player, update the task map, and return an
 * assign-task event (or nothing if no task is available).
 */
function advanceTask(
    playerId: string,
    sessionState: SessionState<DrawSearchModeState>,
    playerCurrentTask: Map<string, DrawSearchPlayerTask>,
    ds: DrawSearchGameConfig,
): DrawSearchServerEvent[] {
    const lastTask = playerCurrentTask.get(playerId);
    const nextTask = pickNextTask(playerId, sessionState, lastTask, ds);
    const events: DrawSearchServerEvent[] = [];

    if (nextTask) {
        playerCurrentTask.set(playerId, nextTask);
        events.push({type: "assign-task", targetPlayerId: playerId, task: nextTask});
    } else {
        playerCurrentTask.delete(playerId);
    }

    return events;
}

// ─── Submit Drawing ──────────────────────────────────────────────

export async function handleSubmitDrawing(
    sessionState: SessionState<DrawSearchModeState>,
    context: GameActionContext,
    imageDataUrl: string,
    playerCurrentTask: Map<string, DrawSearchPlayerTask>,
    ds: DrawSearchGameConfig,
    assetRepository: AssetRepository,
): Promise<GameActionResult<"draw-search">> {
    const ms = sessionState.modeState;
    if (ms.phase !== "ACTIVE") return {stateChanged: false, emittedEvents: []};

    const currentTask = playerCurrentTask.get(context.playerId);
    if (!currentTask || currentTask.mode !== "DRAW") return {stateChanged: false, emittedEvents: []};

    const prompt = currentTask.prompt;
    const drawingId = crypto.randomUUID();
    const playerName = sessionState.players[context.playerId]?.name || "player";

    const savedAsset = await assetRepository.saveDrawing({
        sessionId: context.sessionId,
        playerId: context.playerId,
        playerName,
        drawingId,
        prompt,
        imageDataUrl,
    });

    const drawing: DrawSearchDrawing = {
        id: drawingId,
        artistId: context.playerId,
        prompt,
        imageUrl: savedAsset.publicUrl,
        imageAssetPath: savedAsset.assetPath,
        placedAt: context.now,
    };

    ms.drawings[drawingId] = drawing;

    const realCaptionId = `real-${drawingId}`;
    ms.captions[realCaptionId] = {
        id: realCaptionId,
        drawingId,
        text: prompt,
        authorId: "__system__",
        isReal: true,
    };

    const events = advanceTask(context.playerId, sessionState, playerCurrentTask, ds);
    return {stateChanged: true, emittedEvents: events};
}

// ─── Submit Caption ──────────────────────────────────────────────

export function handleSubmitCaption(
    sessionState: SessionState<DrawSearchModeState>,
    context: GameActionContext,
    drawingId: string,
    text: string,
    playerCurrentTask: Map<string, DrawSearchPlayerTask>,
    ds: DrawSearchGameConfig,
): GameActionResult<"draw-search"> {
    const ms = sessionState.modeState;
    if (ms.phase !== "ACTIVE") return {stateChanged: false, emittedEvents: []};

    const currentTask = playerCurrentTask.get(context.playerId);
    if (!currentTask || currentTask.mode !== "CAPTION" || currentTask.drawingId !== drawingId) {
        return {stateChanged: false, emittedEvents: []};
    }

    const trimmed = text.trim();

    // ── Duplicate check: compare against real title and existing captions ──
    const existingCaptions = Object.values(ms.captions)
        .filter((c) => c.drawingId === drawingId);

    const normalize = (s: string) => s.trim().toLowerCase();
    const isDuplicate = existingCaptions.some(
        (c) => normalize(c.text) === normalize(trimmed),
    );

    if (isDuplicate) {
        const events: DrawSearchServerEvent[] = [{
            type: "caption-rejected",
            targetPlayerId: context.playerId,
            drawingId,
            reason: "Dieser Titel existiert bereits – denk dir einen anderen aus!",
        }];
        return {stateChanged: false, emittedEvents: events};
    }

    const captionId = crypto.randomUUID();
    ms.captions[captionId] = {
        id: captionId,
        drawingId,
        text: trimmed,
        authorId: context.playerId,
        isReal: false,
    };

    const events = advanceTask(context.playerId, sessionState, playerCurrentTask, ds);
    return {stateChanged: true, emittedEvents: events};
}

// ─── Submit Guess ────────────────────────────────────────────────

export function handleSubmitGuess(
    sessionState: SessionState<DrawSearchModeState>,
    context: GameActionContext,
    drawingId: string,
    captionId: string,
    playerCurrentTask: Map<string, DrawSearchPlayerTask>,
    ds: DrawSearchGameConfig,
): GameActionResult<"draw-search"> {
    const ms = sessionState.modeState;
    if (ms.phase !== "ACTIVE") return {stateChanged: false, emittedEvents: []};

    const currentTask = playerCurrentTask.get(context.playerId);
    if (!currentTask || currentTask.mode !== "GUESS" || currentTask.drawingId !== drawingId) {
        return {stateChanged: false, emittedEvents: []};
    }

    // Check correctness
    const realCaption = Object.values(ms.captions).find(
        (c) => c.drawingId === drawingId && c.isReal,
    );
    const isCorrect = captionId === realCaption?.id;

    // Store guess
    if (!ms.playerGuesses[context.playerId]) ms.playerGuesses[context.playerId] = [];
    ms.playerGuesses[context.playerId].push({
        drawingId,
        chosenCaptionId: captionId,
        playerId: context.playerId,
        isCorrect,
    });

    const events: DrawSearchServerEvent[] = [];

    // Award points
    if (isCorrect) {
        const player = sessionState.players[context.playerId];
        if (player) {
            player.score += ds.pointsCorrectGuess;
            events.push({
                type: "score-update",
                playerId: context.playerId,
                newScore: player.score,
                reason: "Richtig geraten!",
            });
        }
    } else {
        const chosenCaption = ms.captions[captionId];
        if (chosenCaption && !chosenCaption.isReal && chosenCaption.authorId !== "__system__") {
            const author = sessionState.players[chosenCaption.authorId];
            if (author) {
                author.score += ds.pointsFooledPlayer;
                events.push({
                    type: "score-update",
                    playerId: chosenCaption.authorId,
                    newScore: author.score,
                    reason: `Dein Fake-Titel hat ${sessionState.players[context.playerId]?.name ?? "jemanden"} getäuscht!`,
                });
            }
        }
    }

    events.push({
        type: "guess-result",
        targetPlayerId: context.playerId,
        drawingId,
        correct: isCorrect,
        message: isCorrect ? "Richtig! 🎉" : "Falsch!",
        correctTitle: realCaption?.text ?? "???",
    });

    events.push(...advanceTask(context.playerId, sessionState, playerCurrentTask, ds));
    return {stateChanged: true, emittedEvents: events};
}

