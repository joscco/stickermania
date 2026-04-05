import {Component, signal, computed, ElementRef, ViewChild, OnDestroy, OnInit, AfterViewInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {RouterModule} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import type {StickerDefinition} from "@birthday/shared";
import {autoDetectHitbox, type Point} from "./auto-hitbox.util";
import {firstValueFrom} from "rxjs";

/**
 * Visual hitbox polygon editor for stickers.
 *
 * Uses an <img> + SVG overlay approach (no canvas) so the image aspect ratio
 * is handled natively by the browser with zero layout shift.
 *
 * Route: /hitbox-editor
 */
@Component({
    selector: "app-hitbox-editor",
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: "./hitbox-editor.component.html",
})
export class HitboxEditorComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild("editorArea") editorArea!: ElementRef<HTMLDivElement>;

    /** Sticker catalog — loaded dynamically from backend */
    public readonly catalog = signal<StickerDefinition[]>([]);

    public readonly selectedSticker = signal<StickerDefinition | null>(null);
    public readonly polygon = signal<Point[]>([]);
    public readonly selectedVertex = signal<number>(-1);
    public readonly autoDetecting = signal(false);
    public readonly tolerance = signal(0.02);
    public readonly alphaThreshold = signal(20);
    public readonly saving = signal(false);
    public readonly saveStatus = signal<string>("");

    /** Natural image dimensions (updated on image load) */
    private readonly imgNatWidth = signal(1);
    private readonly imgNatHeight = signal(1);

    /** Available container size (updated via ResizeObserver) */
    private readonly containerWidth = signal(600);
    private readonly containerHeight = signal(400);

    /** Fitted image dimensions that fill available space while preserving aspect ratio */
    public readonly fittedWidth = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const cw = this.containerWidth();
        const ch = this.containerHeight();
        if (cw / ch > aspect) {
            // Container is wider than image → height-limited
            return Math.floor(ch * aspect);
        }
        return Math.floor(cw);
    });

    public readonly fittedHeight = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const cw = this.containerWidth();
        const ch = this.containerHeight();
        if (cw / ch > aspect) {
            return Math.floor(ch);
        }
        return Math.floor(cw / aspect);
    });

    private draggingVertex = -1;
    private resizeObserver: ResizeObserver | null = null;

    // ── Computed ──────────────────────────────────────────────

    public readonly hasPolygon = computed(() => this.polygon().length >= 3);

    public readonly codeSnippet = computed(() => {
        const pts = this.polygon();
        const sticker = this.selectedSticker();
        if (!sticker || pts.length < 3) return "";
        const polyStr = pts.map(p => `{x:${p.x},y:${p.y}}`).join(",");
        return `hitboxPolygon: [${polyStr}]`;
    });

    /** SVG points string for the current polygon (coordinates in 0–1000 viewBox) */
    public readonly svgPoints = computed(() => {
        return this.polygon().map(p => `${p.x * 1000},${p.y * 1000}`).join(" ");
    });

    constructor(private readonly http: HttpClient) {}

    // ── Lifecycle ─────────────────────────────────────────────

    async ngOnInit(): Promise<void> {
        await this.loadCatalog();
    }

    ngOnDestroy(): void {}

    // ── Load catalog from backend ────────────────────────────

    private async loadCatalog(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.http.get<StickerDefinition[]>("/api/sticker-catalog")
            );
            if (data && data.length > 0) {
                this.catalog.set(data);
                return;
            }
        } catch { /* fall through to fallback */ }

        // Fallback: load hitbox-data and merge manually
        try {
            const hitboxData = await firstValueFrom(
                this.http.get<Record<string, Point[]>>("/api/hitbox-data")
            ) ?? {};
            this.catalog.set(FALLBACK_CATALOG.map(s => {
                const poly = hitboxData[s.id];
                return (poly?.length ?? 0) >= 3 ? {...s, hitboxPolygon: poly} : s;
            }));
        } catch {
            this.catalog.set(FALLBACK_CATALOG);
        }
    }

    public hasSavedHitbox(sticker: StickerDefinition): boolean {
        return !!(sticker.hitboxPolygon && sticker.hitboxPolygon.length >= 3);
    }

    // ── Sticker selection ────────────────────────────────────

    public selectSticker(sticker: StickerDefinition): void {
        this.selectedSticker.set(sticker);
        this.selectedVertex.set(-1);
        this.polygon.set(sticker.hitboxPolygon ? [...sticker.hitboxPolygon] : []);
    }

    // ── Auto-detect ──────────────────────────────────────────

    public async runAutoDetect(): Promise<void> {
        const sticker = this.selectedSticker();
        if (!sticker) return;

        this.autoDetecting.set(true);
        try {
            const result = await autoDetectHitbox(
                sticker.imageUrl,
                this.tolerance(),
                this.alphaThreshold(),
            );
            if (result.length >= 3) {
                this.polygon.set(result);
                this.selectedVertex.set(-1);
            }
        } finally {
            this.autoDetecting.set(false);
        }
    }

    // ── Save to backend ──────────────────────────────────────

    public async saveCurrentHitbox(): Promise<void> {
        const sticker = this.selectedSticker();
        if (!sticker) return;
        const pts = this.polygon();

        this.saving.set(true);
        this.saveStatus.set("");
        try {
            await firstValueFrom(
                this.http.put(`/api/hitbox-data/${encodeURIComponent(sticker.id)}`, {polygon: pts})
            );
            // Update catalog entry in-place so the sidebar dot updates
            const current = this.catalog();
            const idx = current.findIndex(s => s.id === sticker.id);
            if (idx >= 0) {
                const updated = [...current];
                updated[idx] = {...updated[idx], hitboxPolygon: pts.length >= 3 ? pts : undefined};
                this.catalog.set(updated);
                this.selectedSticker.set(updated[idx]);
            }
            this.saveStatus.set("✅");
        } catch {
            this.saveStatus.set("❌");
        } finally {
            this.saving.set(false);
            setTimeout(() => this.saveStatus.set(""), 2000);
        }
    }

    // ── SVG mouse interaction ────────────────────────────────

    /** Convert a mouse event on the editor area to normalised 0–1 coordinates */
    private getNormCoords(event: MouseEvent): {x: number; y: number} {
        const el = this.editorArea?.nativeElement;
        if (!el) return {x: 0, y: 0};
        const rect = el.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)),
        };
    }

    public onEditorMouseDown(event: MouseEvent): void {
        const {x, y} = this.getNormCoords(event);
        const pts = this.polygon();
        const el = this.editorArea?.nativeElement;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const hitPx = 14;

        const selIdx = this.selectedVertex();

        // 1. Delete icon hit?
        if (selIdx >= 0 && selIdx < pts.length) {
            const sp = pts[selIdx];
            const iconNx = Math.min(0.96, Math.max(0.04, sp.x + 0.04));
            const iconNy = Math.min(0.96, Math.max(0.04, sp.y - 0.04));
            const dxPx = (iconNx - x) * rect.width;
            const dyPx = (iconNy - y) * rect.height;
            if (Math.hypot(dxPx, dyPx) < 20) {
                this.removeVertex(selIdx);
                event.preventDefault();
                return;
            }
        }

        // 2. Vertex hit?
        for (let i = 0; i < pts.length; i++) {
            const dxPx = (pts[i].x - x) * rect.width;
            const dyPx = (pts[i].y - y) * rect.height;
            if (Math.hypot(dxPx, dyPx) < hitPx) {
                this.selectedVertex.set(i);
                this.draggingVertex = i;
                event.preventDefault();
                return;
            }
        }

        // 3. Edge midpoint / line hit? → insert point
        if (pts.length >= 2) {
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                // Check midpoint
                const mx = (pts[i].x + pts[j].x) / 2;
                const my = (pts[i].y + pts[j].y) / 2;
                if (Math.hypot((mx - x) * rect.width, (my - y) * rect.height) < 10) {
                    return this.insertVertex(j, mx, my, event);
                }
                // Check line
                const dist = this.ptSegDistPx(x, y, pts[i], pts[j], rect);
                if (dist < 10) {
                    const proj = this.projectOntoSeg(x, y, pts[i], pts[j]);
                    return this.insertVertex(j, proj.x, proj.y, event);
                }
            }
        }

        // 4. Empty space → add point
        const newPt = this.roundPoint({x, y});
        this.polygon.set([...pts, newPt]);
        this.selectedVertex.set(pts.length);
        this.draggingVertex = pts.length;
        event.preventDefault();
    }

    public onEditorMouseMove(event: MouseEvent): void {
        if (this.draggingVertex < 0) return;
        const {x, y} = this.getNormCoords(event);
        const pts = [...this.polygon()];
        pts[this.draggingVertex] = this.roundPoint({x, y});
        this.polygon.set(pts);
    }

    public onEditorMouseUp(): void {
        this.draggingVertex = -1;
    }

    // ── Vertex management ───────────────────────────────────

    private insertVertex(atIndex: number, x: number, y: number, event: MouseEvent): void {
        const pts = [...this.polygon()];
        const newPt = this.roundPoint({x, y});
        pts.splice(atIndex, 0, newPt);
        this.polygon.set(pts);
        this.selectedVertex.set(atIndex);
        this.draggingVertex = atIndex;
        event.preventDefault();
    }

    public removeVertex(index: number): void {
        const pts = [...this.polygon()];
        pts.splice(index, 1);
        this.polygon.set(pts);
        this.selectedVertex.set(-1);
    }

    public clearPolygon(): void {
        this.polygon.set([]);
        this.selectedVertex.set(-1);
    }

    // ── Copy to clipboard ───────────────────────────────────

    public async copySnippet(): Promise<void> {
        const text = this.codeSnippet();
        if (!text) return;
        try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
    }

    // ── Helpers ──────────────────────────────────────────────

    /** SVG viewBox coordinate (0–1000) for a normalised value */
    public vc(v: number): number { return v * 1000; }

    /** Delete icon position in normalised coords, offset from vertex */
    public deleteIconX(pt: Point): number { return Math.min(0.96, Math.max(0.04, pt.x + 0.04)); }
    public deleteIconY(pt: Point): number { return Math.min(0.96, Math.max(0.04, pt.y - 0.04)); }

    private roundPoint(p: Point): Point {
        return { x: Math.round(p.x * 100) / 100, y: Math.round(p.y * 100) / 100 };
    }

    private ptSegDistPx(px: number, py: number, a: Point, b: Point, rect: DOMRect): number {
        const ax = a.x * rect.width, ay = a.y * rect.height;
        const bx = b.x * rect.width, by = b.y * rect.height;
        const ppx = px * rect.width, ppy = py * rect.height;
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(ppx - ax, ppy - ay);
        const t = Math.max(0, Math.min(1, ((ppx - ax) * dx + (ppy - ay) * dy) / lenSq));
        return Math.hypot(ppx - (ax + t * dx), ppy - (ay + t * dy));
    }

    private projectOntoSeg(px: number, py: number, a: Point, b: Point): Point {
        const dx = b.x - a.x, dy = b.y - a.y;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return {x: a.x, y: a.y};
        const t = Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / lenSq));
        return {x: a.x + t * dx, y: a.y + t * dy};
    }
}

/** Fallback catalog when backend is unavailable */
const FALLBACK_CATALOG: StickerDefinition[] = [
    {id: "eyes_round",      imageUrl: "assets/png/sticker_eye_round.png",      categories: ["eyes"]},
    {id: "eyes_cute",       imageUrl: "assets/png/sticker_eye_cute.png",       categories: ["eyes"]},
    {id: "eyes_sleepy",     imageUrl: "assets/png/sticker_eye_sleepy.png",     categories: ["eyes"]},
    {id: "eyes_star",       imageUrl: "assets/png/sticker_eye_star.png",       categories: ["eyes"]},
    {id: "eyes_heart",      imageUrl: "assets/png/sticker_eye_heart.png",      categories: ["eyes"]},
];
