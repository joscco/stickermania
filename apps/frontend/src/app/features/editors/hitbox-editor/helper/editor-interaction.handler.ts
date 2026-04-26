import {Injectable} from "@angular/core";
import type {Point} from "./auto-hitbox.util";
import {PolygonEditService} from "./polygon-edit.service";

/**
 * Handles mouse and keyboard interaction for the hitbox editor canvas.
 * Translates raw DOM events into polygon-edit operations.
 */
@Injectable()
export class EditorInteractionHandler {
    private draggingVertex = -1;

    constructor(private readonly polygonEdit: PolygonEditService) {}

    // ── Mouse events ────────────────────────────────────────

    /**
     * Call on mousedown inside the editor wrapper.
     * Handles vertex selection, edge insertion, and new-point creation.
     */
    public onMouseDown(event: MouseEvent): void {
        const {x, y} = this.getNormCoords(event);
        const pts = this.polygonEdit.polygon();
        const {imgW, imgH} = this.getImagePixelSize(event);

        // 1. Vertex hit?
        for (let i = 0; i < pts.length; i++) {
            if (Math.hypot((pts[i].x - x) * imgW, (pts[i].y - y) * imgH) < 14) {
                this.polygonEdit.select(i);
                this.draggingVertex = i;
                event.preventDefault();
                return;
            }
        }

        // 2. Edge midpoint / line hit? → insert point
        if (pts.length >= 2) {
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                const mx = (pts[i].x + pts[j].x) / 2;
                const my = (pts[i].y + pts[j].y) / 2;
                if (Math.hypot((mx - x) * imgW, (my - y) * imgH) < 10) {
                    this.insertAndDrag(j, mx, my, event);
                    return;
                }
                const dist = ptSegDistPx(x, y, pts[i], pts[j], imgW, imgH);
                if (dist < 10) {
                    const proj = projectOntoSeg(x, y, pts[i], pts[j]);
                    this.insertAndDrag(j, proj.x, proj.y, event);
                    return;
                }
            }
        }

        // 3. Empty space → add point
        this.draggingVertex = this.polygonEdit.addVertex(x, y);
        event.preventDefault();
    }

    /** Call on mousemove inside the editor wrapper. */
    public onMouseMove(event: MouseEvent): void {
        if (this.draggingVertex < 0) return;
        const {x, y} = this.getNormCoords(event);
        this.polygonEdit.moveVertex(this.draggingVertex, x, y);
    }

    /** Call on mouseup / mouseleave inside the editor wrapper. */
    public onMouseUp(): void {
        this.draggingVertex = -1;
    }

    // ── Keyboard events ─────────────────────────────────────

    /**
     * Call on keydown. Returns true if the event was handled
     * (caller should preventDefault).
     */
    public onKeyDown(event: KeyboardEvent): boolean {
        if (event.key === "Backspace" || event.key === "Delete") {
            return this.polygonEdit.removeSelected();
        }
        return false;
    }

    // ── Helpers ──────────────────────────────────────────────

    private insertAndDrag(atIndex: number, x: number, y: number, event: MouseEvent): void {
        this.draggingVertex = this.polygonEdit.insertVertex(atIndex, x, y);
        event.preventDefault();
    }

    /**
     * Compute the image pixel size from the wrapper element.
     * The wrapper is (1 + 2*overflowFraction) × imageSize, so:
     *   imageSize = wrapperSize / (1 + 2*overflowFraction)
     */
    private getImagePixelSize(event: MouseEvent): {imgW: number; imgH: number} {
        const target = event.currentTarget as HTMLElement;
        return {
            imgW: target.clientWidth,
            imgH: target.clientHeight,
        };
    }

    /**
     * Convert a mouse event to normalised image coordinates.
     * (0,0) = top-left of image, (1,1) = bottom-right.
     * Values can be slightly outside [0,1] in the overflow zone.
     */
    private getNormCoords(event: MouseEvent): {x: number; y: number} {
        const target = event.currentTarget as HTMLElement;
        const rect = target.getBoundingClientRect();
        const imgW = rect.width;
        const imgH = rect.height;
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / imgW)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / imgH)),
        };
    }
}

// ── Geometry helpers (pure functions) ────────────────────────

function ptSegDistPx(px: number, py: number, a: Point, b: Point, imgW: number, imgH: number): number {
    const ax = a.x * imgW, ay = a.y * imgH;
    const bx = b.x * imgW, by = b.y * imgH;
    const ppx = px * imgW, ppy = py * imgH;
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(ppx - ax, ppy - ay);
    const t = Math.max(0, Math.min(1, ((ppx - ax) * dx + (ppy - ay) * dy) / lenSq));
    return Math.hypot(ppx - (ax + t * dx), ppy - (ay + t * dy));
}

function projectOntoSeg(px: number, py: number, a: Point, b: Point): Point {
    const dx = b.x - a.x, dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return {x: a.x, y: a.y};
    const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
    return {x: a.x + t * dx, y: a.y + t * dy};
}

