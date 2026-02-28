import crypto from "node:crypto";
import type {CellKey, ObjectType, WorldState} from "@birthday/shared";
import { clampInt, toCellKey } from "@birthday/shared";

export class WorldStore {
    private worldState: WorldState;

    public constructor(args: { initialWorldState: WorldState }) {
        this.worldState = args.initialWorldState;
    }

    public getState(): WorldState {
        return this.worldState;
    }

    public reset(args: { gridWidth: number; gridHeight: number }): void {
        this.worldState = {
            width: args.gridWidth,
            height: args.gridHeight,
            cells: {},
            revision: 0,
            updatedAt: Date.now()
        };
    }

    public place(args: { x: number; y: number; objectType: ObjectType }): void {
        const x: number = clampInt(args.x, 0, this.worldState.width - 1);
        const y: number = clampInt(args.y, 0, this.worldState.height - 1);
        const cellKey: CellKey = toCellKey(x, y);

        this.worldState.cells[cellKey] = {
            id: crypto.randomUUID(),
            type: args.objectType,
            level: 1,
            placedAt: Date.now()
        };

        this.bumpRevision();
    }

    public remove(args: { x: number; y: number }): boolean {
        const x: number = clampInt(args.x, 0, this.worldState.width - 1);
        const y: number = clampInt(args.y, 0, this.worldState.height - 1);
        const cellKey: CellKey = toCellKey(x, y);

        if (!this.worldState.cells[cellKey]) {
            return false;
        }

        delete this.worldState.cells[cellKey];
        this.bumpRevision();
        return true;
    }

    private bumpRevision(): void {
        this.worldState.revision = this.worldState.revision + 1;
        this.worldState.updatedAt = Date.now();
    }
}