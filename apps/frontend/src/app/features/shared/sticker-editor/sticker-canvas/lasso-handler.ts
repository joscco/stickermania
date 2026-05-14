import type {StickerPlacement} from "@birthday/shared";
import {pointInPoly} from "../geometry-helpers";

export interface LassoCallbacks {
    onPathChanged: (path: { x: number; y: number }[] | null) => void;
    onSelectionChanged: (ids: Set<string>) => void;
    onSelectedChanged: (id: string | null) => void;
}

/**
 * Self-contained freehand lasso gesture.
 *
 * Activated via `start()`, fed points via `addPoint()`, resolved via `finalize()`.
 * On finalize: closes the path, captures stickers whose centres fall inside the
 * polygon, and fires the appropriate callbacks (lasso selection or single select).
 */
export class LassoHandler {
    private active = false;
    private path: { x: number; y: number }[] = [];

    constructor(
        private getStickers: () => StickerPlacement[],
        private cb: LassoCallbacks,
    ) {}

    start(x: number, y: number): void {
        this.active = true;
        this.path = [{x, y}];
        this.cb.onPathChanged([{x, y}]);
    }

    addPoint(x: number, y: number): void {
        if (!this.active) return;
        const last = this.path[this.path.length - 1];
        if (!last || Math.hypot(x - last.x, y - last.y) > 2) {
            this.path.push({x, y});
            this.cb.onPathChanged([...this.path]);
        }
    }

    finalize(): void {
        if (!this.active) return;
        this.active = false;
        this.cb.onPathChanged(null);

        const points = this.path;
        this.path = [];

        if (points.length < 2) return;

        const poly = points.length === 2
            ? this.twoPointRect(points[0], points[1])
            : [...points, points[0]];

        const stickers = this.getStickers();
        const captured = stickers.filter(s => pointInPoly(s.x, s.y, poly));

        if (captured.length > 1) {
            this.cb.onSelectedChanged(null);
            this.cb.onSelectionChanged(new Set(captured.map(s => s.instanceId)));
        } else if (captured.length === 1) {
            this.cb.onSelectionChanged(new Set());
            this.cb.onSelectedChanged(captured[0].instanceId);
        }
    }

    cancel(): void {
        this.active = false;
        this.path = [];
        this.cb.onPathChanged(null);
    }

    isActive(): boolean {
        return this.active;
    }

    private twoPointRect(a: { x: number; y: number }, b: { x: number; y: number }) {
        return [
            {x: a.x, y: a.y}, {x: b.x, y: a.y},
            {x: b.x, y: b.y}, {x: a.x, y: b.y},
            {x: a.x, y: a.y},
        ];
    }
}
