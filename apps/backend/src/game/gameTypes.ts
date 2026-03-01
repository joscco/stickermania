export interface ChallengeState {
    revision: number;
    activeChallenge: null | {
        id: string;
        text: string;
        endsAt: number;
        createdAt: number;
    };

    activeSubmission: null | {
        screenshotDataUrl?: string | null;
        id: string;
        challengeId: string;
        createdAt: number;
        endsAt: number;
        snapshotWorld: any; // we keep it simple; validated on load
        yesVotes: number;
        noVotes: number;
        voters: Record<string, true>; // voterId -> true
        status: "OPEN" | "ACCEPTED" | "REJECTED";
    };
}

export interface PersistedState {
    world: any;
    challenge: ChallengeState;
}