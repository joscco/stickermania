import crypto from "node:crypto";
import type { ChallengeState } from "./gameTypes.js";

export class ChallengeStore {
    private state: ChallengeState;

    public constructor(args?: { initial?: ChallengeState }) {
        this.state = args?.initial ?? {
            revision: 0,
            activeChallenge: null,
            activeSubmission: null
        };
    }

    public getState(): ChallengeState {
        this.expireChallengeIfNeeded();
        this.finalizeSubmissionIfNeeded();
        return this.state;
    }

    public reset(): void {
        this.state = {
            revision: 0,
            activeChallenge: null,
            activeSubmission: null
        };
    }

    public startChallenge(args: { text: string; durationMs: number }): void {
        const now = Date.now();
        const id = crypto.randomUUID();

        this.state.activeChallenge = {
            id,
            text: args.text,
            createdAt: now,
            endsAt: now + args.durationMs
        };

        // new challenge => clear current submission
        this.state.activeSubmission = null;
        this.bumpRevision();
    }

    public submit(args: { voterId: string; snapshotWorld: unknown, screenshotDataUrl?: string | null  }): { ok: boolean; message?: string } {
        this.expireChallengeIfNeeded();
        this.finalizeSubmissionIfNeeded();

        if (!this.state.activeChallenge) {
            return { ok: false, message: "No active challenge" };
        }

        if (this.state.activeSubmission && this.state.activeSubmission.status === "OPEN") {
            return { ok: false, message: "Vote already running" };
        }

        const now = Date.now();
        const id = crypto.randomUUID();

        this.state.activeSubmission = {
            id,
            challengeId: this.state.activeChallenge.id,
            createdAt: now,
            endsAt: now + 25_000,
            snapshotWorld: args.snapshotWorld,
            screenshotDataUrl: args.screenshotDataUrl ?? null,
            yesVotes: 0,
            noVotes: 0,
            voters: {},
            status: "OPEN"
        };

        // auto-vote of submitter? optional: yes by default
        this.vote({ submissionId: id, voterId: args.voterId, vote: true });

        this.bumpRevision();
        return { ok: true };
    }

    public vote(args: { submissionId: string; voterId: string; vote: boolean }): { ok: boolean; message?: string } {
        this.finalizeSubmissionIfNeeded();

        const submission = this.state.activeSubmission;
        if (!submission || submission.status !== "OPEN") {
            return { ok: false, message: "No open vote" };
        }

        if (submission.id !== args.submissionId) {
            return { ok: false, message: "Vote not matching active submission" };
        }

        if (submission.voters[args.voterId]) {
            return { ok: false, message: "Already voted" };
        }

        submission.voters[args.voterId] = true;

        if (args.vote) {
            submission.yesVotes = submission.yesVotes + 1;
        } else {
            submission.noVotes = submission.noVotes + 1;
        }

        // early finalize if enough votes
        const totalVotes = submission.yesVotes + submission.noVotes;
        if (totalVotes >= 6) {
            this.finalizeOpenSubmission();
        }

        this.bumpRevision();
        return { ok: true };
    }

    private expireChallengeIfNeeded(): void {
        if (!this.state.activeChallenge) {
            return;
        }
        if (Date.now() < this.state.activeChallenge.endsAt) {
            return;
        }
        this.state.activeChallenge = null;
        this.state.activeSubmission = null;
        this.bumpRevision();
    }

    private finalizeSubmissionIfNeeded(): void {
        const submission = this.state.activeSubmission;
        if (!submission || submission.status !== "OPEN") {
            return;
        }
        if (Date.now() < submission.endsAt) {
            return;
        }
        this.finalizeOpenSubmission();
    }

    private finalizeOpenSubmission(): void {
        const submission = this.state.activeSubmission;
        if (!submission || submission.status !== "OPEN") {
            return;
        }

        if (submission.yesVotes > submission.noVotes) {
            submission.status = "ACCEPTED";
        } else {
            submission.status = "REJECTED";
        }
    }

    private bumpRevision(): void {
        this.state.revision = this.state.revision + 1;
    }
}