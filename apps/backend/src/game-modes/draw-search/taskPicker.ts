import type {
    DrawSearchGameConfig,
    DrawSearchModeState,
    DrawSearchPlayerTask,
    SessionState,
} from "@birthday/shared";

/**
 * Pick the best next task for a player. Cycle: DRAW → CAPTION → GUESS → DRAW...
 *
 * Priority order depends on what the player just completed:
 * - After DRAW   → CAPTION, GUESS, DRAW
 * - After CAPTION → GUESS, DRAW, CAPTION
 * - After GUESS  → DRAW, CAPTION, GUESS
 * - First task   → always DRAW
 */
export function pickNextTask(
    playerId: string,
    sessionState: SessionState<DrawSearchModeState>,
    lastTask: DrawSearchPlayerTask | undefined,
    ds: DrawSearchGameConfig,
): DrawSearchPlayerTask | null {
    const ms = sessionState.modeState;
    const lastMode = lastTask?.mode;

    // ── Determine what the player has already done ───────────────

    const playerCaptionedDrawingIds = new Set(
        Object.values(ms.captions)
            .filter((c) => !c.isReal && c.authorId === playerId)
            .map((c) => c.drawingId),
    );
    const playerGuessedDrawingIds = new Set(
        (ms.playerGuesses[playerId] ?? []).map((g) => g.drawingId),
    );

    // ── Candidate sets ──────────────────────────────────────────

    const namedPlayerIds = Object.keys(sessionState.players)
        .filter((pid) => sessionState.players[pid]?.name.trim());

    const needsCaptions = Object.values(ms.drawings).filter((d) => {
        if (d.artistId === playerId) return false;
        if (playerCaptionedDrawingIds.has(d.id)) return false;
        const fakeCaptionCount = Object.values(ms.captions)
            .filter((c) => c.drawingId === d.id && !c.isReal).length;
        // Cap required captions by number of non-artist players (each can write at most 1)
        const nonArtistCount = namedPlayerIds.filter((pid) => pid !== d.artistId).length;
        const effectiveRequired = Math.min(ds.fakeCaptionsPerDrawing, nonArtistCount);
        return fakeCaptionCount < effectiveRequired;
    });

    const guessable = Object.values(ms.drawings).filter((d) => {
        if (d.artistId === playerId) return false;
        if (playerGuessedDrawingIds.has(d.id)) return false;
        // Require at least 1 fake caption from ANOTHER player (not our own)
        const otherFakeCaptionCount = Object.values(ms.captions)
            .filter((c) => c.drawingId === d.id && !c.isReal && c.authorId !== playerId).length;
        return otherFakeCaptionCount >= 1;
    });

    // ── Task builders ───────────────────────────────────────────

    const tryCaption = (): DrawSearchPlayerTask | null => {
        if (needsCaptions.length === 0) return null;
        const drawing = pickRandom(needsCaptions);
        return {mode: "CAPTION", drawingId: drawing.id, imageUrl: drawing.imageUrl};
    };

    const tryGuess = (): DrawSearchPlayerTask | null => {
        if (guessable.length === 0) return null;
        const drawing = pickRandom(guessable);
        // Include real caption + fake captions from OTHER players (exclude own fakes)
        const drawingCaptions = Object.values(ms.captions)
            .filter((c) => c.drawingId === drawing.id && (c.isReal || c.authorId !== playerId));
        const shuffled = shuffleArray(
            drawingCaptions.map((c) => ({id: c.id, text: c.text})),
        );
        return {
            mode: "GUESS",
            drawingId: drawing.id,
            imageUrl: drawing.imageUrl,
            artistName: sessionState.players[drawing.artistId]?.name ?? "Unbekannt",
            captions: shuffled,
        };
    };

    const tryDraw = (): DrawSearchPlayerTask | null => {
        const prompt = pickPrompt(playerId, ms, ds);
        return {mode: "DRAW", prompt};
    };

    // ── Cycle logic ─────────────────────────────────────────────

    if (lastMode === "DRAW") return tryCaption() ?? tryGuess() ?? tryDraw();
    if (lastMode === "CAPTION") return tryGuess() ?? tryDraw() ?? tryCaption();
    if (lastMode === "GUESS") return tryDraw() ?? tryCaption() ?? tryGuess();

    // First task — always start with DRAW
    return tryDraw();
}

// ═══════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════

/** Pick a random prompt that this player hasn't drawn yet (if possible). */
function pickPrompt(playerId: string, ms: DrawSearchModeState, ds: DrawSearchGameConfig): string {
    const usedPrompts = new Set(
        Object.values(ms.drawings)
            .filter((d) => d.artistId === playerId)
            .map((d) => d.prompt),
    );
    const available = ds.drawPrompts.filter((p) => !usedPrompts.has(p));
    const pool = available.length > 0 ? available : ds.drawPrompts;
    return pool[Math.floor(Math.random() * pool.length)];
}

export function pickRandom<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
}

export function shuffleArray<T>(array: T[]): T[] {
    const result = [...array];
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

