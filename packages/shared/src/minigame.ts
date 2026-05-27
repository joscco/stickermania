export interface Minigame<
    // The data needed to set up a variant of the minigame - id, titles, sprite-names, positions, etc.
    TMinigameVariantData extends MinigameVariantData,
    // The data which each player has to give during the minigame. Might consist of multiple rounds!
    TMinigameSubmission extends MinigameSubmission,
    // The data which is needed to present the result
    TMinigamePlayerResult extends MinigamePlayerResult
> {
    provideData(): TMinigameVariantData;
    calculateResults(submissions: TMinigameSubmission[]): MinigameResult<TMinigamePlayerResult>;
}

export type MinigameVariantData = {
    id: string;
    title: string;
    firstRoundSeconds: number;
}

export type MinigameSubmission = {
    playerId: string;
    type?: string;
    [key: string]: unknown;
}

export type MinigameMessage = {
    type: string;
    payload?: unknown;
}

export type MinigameResult<TPlayerResult extends MinigamePlayerResult> = {
    resultsByPlayerId: Record<string, TPlayerResult>;
}

export type MinigamePlayerResult = {
    playerId: string,
    placement: number
}
