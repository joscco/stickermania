import crypto from "node:crypto";
import type { ObjectType, WorldState, StickerPlacement } from "@birthday/shared";

export class WorldStore {
    private worldState: WorldState;
    private nextZIndex: number;

    public constructor(args: { initialWorldState: WorldState }) {
        this.worldState = args.initialWorldState;
        this.nextZIndex = 1;
    }

    public getState(): WorldState {
        return this.worldState;
    }

    public reset(): void {
        this.worldState = {
            placements: {},
            revision: 0,
            updatedAt: Date.now()
        };
        this.nextZIndex = 1;
    }

    public place(args: { x: number; y: number; objectType: ObjectType; rotationDeg?: number; scale?: number }): StickerPlacement {
        const clampedX: number = this.clamp01(args.x);
        const clampedY: number = this.clamp01(args.y);

        const placement: StickerPlacement = {
            id: crypto.randomUUID(),
            type: args.objectType,
            x: clampedX,
            y: clampedY,
            rotationDeg: Number.isFinite(args.rotationDeg) ? Number(args.rotationDeg) : 0,
            scale: Number.isFinite(args.scale) ? Number(args.scale) : 1,
            zIndex: this.nextZIndex,
            placedAt: Date.now()
        };

        this.nextZIndex = this.nextZIndex + 1;

        this.worldState.placements[placement.id] = placement;
        this.bumpRevision();

        return placement;
    }

    private bumpRevision(): void {
        this.worldState.revision = this.worldState.revision + 1;
        this.worldState.updatedAt = Date.now();
    }

    private clamp01(value: number): number {
        if (!Number.isFinite(value)) {
            return 0;
        }
        if (value < 0) {
            return 0;
        }
        if (value > 1) {
            return 1;
        }
        return value;
    }
}