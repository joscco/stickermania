import {Injectable, signal, computed} from "@angular/core";
import type {Point} from "./auto-hitbox.util";

/**
 * Manages the polygon state for the hitbox editor.
 * Pure state + operations — no I/O, no DOM, no side-effects.
 */
@Injectable()
export class PolygonEditService {
    /** Current polygon vertices (normalised 0–1) */
    public readonly polygon = signal<Point[]>([]);

    /** Index of the currently selected vertex (-1 = none) */
    public readonly selectedVertex = signal<number>(-1);

    /** True when polygon has >= 3 points (valid hitbox) */
    public readonly isValid = computed(() => this.polygon().length >= 3);

    // ── Bulk operations ─────────────────────────────────────

    /** Replace the entire polygon (e.g. after auto-detect or sticker switch) */
    public load(points: Point[]): void {
        this.polygon.set(points);
        this.selectedVertex.set(-1);
    }

    /** Clear all points */
    public clear(): void {
        this.polygon.set([]);
        this.selectedVertex.set(-1);
    }

    // ── Single-vertex operations ────────────────────────────

    /** Append a new point at the end and select it. Returns its index. */
    public addVertex(x: number, y: number): number {
        const pts = this.polygon();
        const idx = pts.length;
        this.polygon.set([...pts, round({x, y})]);
        this.selectedVertex.set(idx);
        return idx;
    }

    /** Insert a point at `atIndex`, shifting later points. Returns `atIndex`. */
    public insertVertex(atIndex: number, x: number, y: number): number {
        const pts = [...this.polygon()];
        pts.splice(atIndex, 0, round({x, y}));
        this.polygon.set(pts);
        this.selectedVertex.set(atIndex);
        return atIndex;
    }

    /** Remove the vertex at `index` and deselect. */
    public removeVertex(index: number): void {
        const pts = [...this.polygon()];
        pts.splice(index, 1);
        this.polygon.set(pts);
        this.selectedVertex.set(-1);
    }

    /** Move an existing vertex to new coordinates. */
    public moveVertex(index: number, x: number, y: number): void {
        const pts = [...this.polygon()];
        pts[index] = round({x, y});
        this.polygon.set(pts);
    }

    /** Select a vertex by index. */
    public select(index: number): void {
        this.selectedVertex.set(index);
    }


    /** Remove the currently selected vertex (if any). Returns true if one was removed. */
    public removeSelected(): boolean {
        const idx = this.selectedVertex();
        if (idx < 0 || idx >= this.polygon().length) return false;
        this.removeVertex(idx);
        return true;
    }
}

// ── Helpers ──────────────────────────────────────────────────

function round(p: Point): Point {
    return {
        x: Math.round(p.x * 100) / 100,
        y: Math.round(p.y * 100) / 100,
    };
}

