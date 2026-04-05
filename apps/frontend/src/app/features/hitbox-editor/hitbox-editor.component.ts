import {Component, signal, computed, ElementRef, ViewChild, AfterViewInit, OnDestroy} from "@angular/core";
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
 * - Select a sticker from the catalog on the left
 * - The image fills the entire available center area
 * - Click to place polygon vertices; drag to move them
 * - Click on a line segment to insert a new point
 * - The last-selected vertex shows a delete button
 * - "Auto-Detect" traces the PNG alpha channel
 * - Hitbox data is saved to the backend (hitbox-data.json)
 *
 * Route: /hitbox-editor
 */
@Component({
    selector: "app-hitbox-editor",
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: "./hitbox-editor.component.html",
})
export class HitboxEditorComponent implements AfterViewInit, OnDestroy {
    @ViewChild("editorCanvas") editorCanvas!: ElementRef<HTMLCanvasElement>;
    @ViewChild("canvasWrapper") canvasWrapper!: ElementRef<HTMLDivElement>;

    /** Full sticker catalog (same as backend DEFAULT_STICKER_CATALOG) */
    public readonly catalog: StickerDefinition[] = [
        {id: "eyes_round",      imageUrl: "assets/png/sticker_eye_round.png",      categories: ["eyes"]},
        {id: "eyes_cute",       imageUrl: "assets/png/sticker_eye_cute.png",       categories: ["eyes"]},
        {id: "eyes_angry",      imageUrl: "assets/png/sticker_eye_angry.png",      categories: ["eyes"]},
        {id: "eyes_sleepy",     imageUrl: "assets/png/sticker_eye_sleepy.png",     categories: ["eyes"]},
        {id: "eyes_star",       imageUrl: "assets/png/sticker_eye_star.png",       categories: ["eyes"]},
        {id: "eyes_heart",      imageUrl: "assets/png/sticker_eye_heart.png",      categories: ["eyes"]},
        {id: "mouth_smile",     imageUrl: "assets/png/sticker_mouth_smile.png",     categories: ["mouth"]},
        {id: "mouth_open",      imageUrl: "assets/png/sticker_mouth_open.png",      categories: ["mouth"]},
        {id: "mouth_teeth",     imageUrl: "assets/png/sticker_mouth_teeth.png",     categories: ["mouth"]},
        {id: "mouth_tongue",    imageUrl: "assets/png/sticker_mouth_tongue.png",    categories: ["mouth"]},
        {id: "nose_round",      imageUrl: "assets/png/sticker_nose_round.png",      categories: ["nose"]},
        {id: "nose_pointy",     imageUrl: "assets/png/sticker_nose_pointy.png",     categories: ["nose"]},
        {id: "nose_clown",      imageUrl: "assets/png/sticker_nose_clown.png",      categories: ["nose"]},
        {id: "shape_circle",    imageUrl: "assets/png/sticker_shape_circle.png",    categories: ["shape"]},
        {id: "shape_square",    imageUrl: "assets/png/sticker_shape_square.png",    categories: ["shape"]},
        {id: "shape_triangle",  imageUrl: "assets/png/sticker_shape_triangle.png",  categories: ["shape"]},
        {id: "shape_star",      imageUrl: "assets/png/sticker_shape_star.png",      categories: ["shape"]},
        {id: "shape_blob",      imageUrl: "assets/png/sticker_shape_blob.png",      categories: ["shape"]},
        {id: "shape_cloud",     imageUrl: "assets/png/sticker_shape_cloud.png",     categories: ["shape"]},
        {id: "fruit_apple",     imageUrl: "assets/png/sticker_fruit_apple.png",     categories: ["fruit"]},
        {id: "fruit_banana",    imageUrl: "assets/png/sticker_fruit_banana.png",    categories: ["fruit"]},
        {id: "fruit_cherry",    imageUrl: "assets/png/sticker_fruit_cherry.png",    categories: ["fruit"]},
        {id: "fruit_strawberry",imageUrl: "assets/png/sticker_fruit_strawberry.png",categories: ["fruit"]},
        {id: "acc_hat",         imageUrl: "assets/png/sticker_acc_hat.png",         categories: ["accessory"]},
        {id: "acc_crown",       imageUrl: "assets/png/sticker_acc_crown.png",       categories: ["accessory"]},
        {id: "acc_glasses",     imageUrl: "assets/png/sticker_acc_glasses.png",     categories: ["accessory"]},
        {id: "acc_bowtie",      imageUrl: "assets/png/sticker_acc_bowtie.png",      categories: ["accessory"]},
    ];

    public readonly selectedSticker = signal<StickerDefinition | null>(null);
    public readonly polygon = signal<Point[]>([]);
    public readonly selectedVertex = signal<number>(-1);
    public readonly autoDetecting = signal(false);
    public readonly tolerance = signal(0.02);
    public readonly alphaThreshold = signal(20);
    public readonly saving = signal(false);
    public readonly saveStatus = signal<string>("");

    /** Saved hitbox data from the backend (stickerId → polygon) */
    public readonly savedHitboxes = signal<Record<string, Point[]>>({});

    private draggingVertex = -1;
    private currentImage: HTMLImageElement | null = null;
    public canvasDisplaySize = 400;
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

    constructor(private readonly http: HttpClient) {}

    // ── Lifecycle ─────────────────────────────────────────────

    ngAfterViewInit(): void {
        this.loadSavedHitboxes();
        // Observe the wrapper size so the canvas always fills the space
        this.resizeObserver = new ResizeObserver(() => this.fitCanvas());
        if (this.canvasWrapper?.nativeElement) {
            this.resizeObserver.observe(this.canvasWrapper.nativeElement);
        }
        this.fitCanvas();
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
    }

    // ── Canvas sizing ────────────────────────────────────────

    private fitCanvas(): void {
        const wrapper = this.canvasWrapper?.nativeElement;
        if (!wrapper) return;
        const rect = wrapper.getBoundingClientRect();
        // Use the smaller dimension to keep the canvas square
        this.canvasDisplaySize = Math.floor(Math.min(rect.width, rect.height));
        this.redrawCanvas();
    }

    // ── Backend persistence ──────────────────────────────────

    private async loadSavedHitboxes(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.http.get<Record<string, Point[]>>("/api/hitbox-data")
            );
            this.savedHitboxes.set(data ?? {});
        } catch {
            // Backend not available — use empty
            this.savedHitboxes.set({});
        }
    }

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
            // Update local cache
            const saved = {...this.savedHitboxes()};
            if (pts.length >= 3) {
                saved[sticker.id] = pts;
            } else {
                delete saved[sticker.id];
            }
            this.savedHitboxes.set(saved);
            this.saveStatus.set("✅ Gespeichert");
        } catch {
            this.saveStatus.set("❌ Fehler beim Speichern");
        } finally {
            this.saving.set(false);
            setTimeout(() => this.saveStatus.set(""), 2000);
        }
    }

    public hasSavedHitbox(stickerId: string): boolean {
        const saved = this.savedHitboxes();
        return !!(saved[stickerId] && saved[stickerId].length >= 3);
    }

    // ── Sticker selection ────────────────────────────────────

    public selectSticker(sticker: StickerDefinition): void {
        this.selectedSticker.set(sticker);
        this.selectedVertex.set(-1);

        // Load from saved hitboxes first, then from catalog
        const saved = this.savedHitboxes()[sticker.id];
        if (saved && saved.length >= 3) {
            this.polygon.set([...saved]);
        } else if (sticker.hitboxPolygon && sticker.hitboxPolygon.length >= 3) {
            this.polygon.set([...sticker.hitboxPolygon]);
        } else {
            this.polygon.set([]);
        }

        this.currentImage = null;
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            this.currentImage = img;
            this.redrawCanvas();
        };
        img.src = sticker.imageUrl;
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
                this.redrawCanvas();
            }
        } finally {
            this.autoDetecting.set(false);
        }
    }

    // ── Canvas drawing ───────────────────────────────────────

    private redrawCanvas(): void {
        const canvas = this.editorCanvas?.nativeElement;
        if (!canvas) return;
        const ctx = canvas.getContext("2d")!;
        const size = this.canvasDisplaySize;
        canvas.width = size;
        canvas.height = size;

        ctx.clearRect(0, 0, size, size);

        // Checkerboard background
        const tileSize = Math.max(8, Math.floor(size / 25));
        for (let y = 0; y < size; y += tileSize) {
            for (let x = 0; x < size; x += tileSize) {
                ctx.fillStyle = ((x + y) / tileSize) % 2 === 0 ? "#f0f0f0" : "#ddd";
                ctx.fillRect(x, y, tileSize, tileSize);
            }
        }

        // Draw the sticker image
        if (this.currentImage) {
            ctx.drawImage(this.currentImage, 0, 0, size, size);
        }

        // Draw polygon
        const pts = this.polygon();
        const selIdx = this.selectedVertex();
        if (pts.length > 0) {
            // Fill
            ctx.beginPath();
            ctx.moveTo(pts[0].x * size, pts[0].y * size);
            for (let i = 1; i < pts.length; i++) {
                ctx.lineTo(pts[i].x * size, pts[i].y * size);
            }
            ctx.closePath();
            ctx.fillStyle = "rgba(168, 85, 247, 0.12)";
            ctx.fill();

            // Edges (thicker for clickability hint)
            ctx.strokeStyle = "rgba(168, 85, 247, 0.7)";
            ctx.lineWidth = 3;
            ctx.stroke();

            // Midpoint "+" indicators on each edge
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                const mx = ((pts[i].x + pts[j].x) / 2) * size;
                const my = ((pts[i].y + pts[j].y) / 2) * size;

                ctx.beginPath();
                ctx.arc(mx, my, 4, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(168, 85, 247, 0.3)";
                ctx.fill();
            }

            // Vertices
            const vertexRadius = Math.max(6, size / 60);
            for (let i = 0; i < pts.length; i++) {
                const px = pts[i].x * size;
                const py = pts[i].y * size;
                const isSelected = i === selIdx;

                ctx.beginPath();
                ctx.arc(px, py, isSelected ? vertexRadius + 2 : vertexRadius, 0, Math.PI * 2);
                ctx.fillStyle = isSelected ? "#ef4444" : (i === 0 ? "#22c55e" : "#a855f7");
                ctx.fill();
                ctx.strokeStyle = "white";
                ctx.lineWidth = 2;
                ctx.stroke();

                // Index label
                ctx.fillStyle = "white";
                ctx.font = `bold ${Math.max(9, size / 45)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText(String(i), px, py);
            }

            // Delete icon near selected vertex
            if (selIdx >= 0 && selIdx < pts.length) {
                const px = pts[selIdx].x * size;
                const py = pts[selIdx].y * size;
                const iconOffset = vertexRadius + 10;
                const iconX = Math.min(size - 12, Math.max(12, px + iconOffset));
                const iconY = Math.min(size - 12, Math.max(12, py - iconOffset));

                // Circle background
                ctx.beginPath();
                ctx.arc(iconX, iconY, 10, 0, Math.PI * 2);
                ctx.fillStyle = "#ef4444";
                ctx.fill();
                ctx.strokeStyle = "white";
                ctx.lineWidth = 1.5;
                ctx.stroke();

                // "×" text
                ctx.fillStyle = "white";
                ctx.font = `bold ${Math.max(12, size / 30)}px sans-serif`;
                ctx.textAlign = "center";
                ctx.textBaseline = "middle";
                ctx.fillText("×", iconX, iconY);
            }
        }
    }

    // ── Mouse interaction ────────────────────────────────────

    private getCanvasCoords(event: MouseEvent): {x: number; y: number} {
        const canvas = this.editorCanvas?.nativeElement;
        if (!canvas) return {x: 0, y: 0};
        const rect = canvas.getBoundingClientRect();
        return {
            x: (event.clientX - rect.left) / rect.width,
            y: (event.clientY - rect.top) / rect.height,
        };
    }

    public onCanvasMouseDown(event: MouseEvent): void {
        const {x, y} = this.getCanvasCoords(event);
        const pts = this.polygon();
        const hitRadius = 14 / this.canvasDisplaySize;
        const selIdx = this.selectedVertex();

        // 1. Check: click on delete icon of selected vertex?
        if (selIdx >= 0 && selIdx < pts.length) {
            const px = pts[selIdx].x;
            const py = pts[selIdx].y;
            const vertexRadius = Math.max(6, this.canvasDisplaySize / 60);
            const iconOffset = (vertexRadius + 10) / this.canvasDisplaySize;
            const iconX = Math.min(1 - 12 / this.canvasDisplaySize, Math.max(12 / this.canvasDisplaySize, px + iconOffset));
            const iconY = Math.min(1 - 12 / this.canvasDisplaySize, Math.max(12 / this.canvasDisplaySize, py - iconOffset));
            if (Math.hypot(iconX - x, iconY - y) < 12 / this.canvasDisplaySize) {
                this.removeVertex(selIdx);
                return;
            }
        }

        // 2. Check: click near an existing vertex → select & start drag
        for (let i = 0; i < pts.length; i++) {
            if (Math.hypot(pts[i].x - x, pts[i].y - y) < hitRadius) {
                this.selectedVertex.set(i);
                this.draggingVertex = i;
                this.redrawCanvas();
                return;
            }
        }

        // 3. Check: click near an edge midpoint → insert point on that edge
        if (pts.length >= 2) {
            const edgeHitRadius = 10 / this.canvasDisplaySize;
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                const mx = (pts[i].x + pts[j].x) / 2;
                const my = (pts[i].y + pts[j].y) / 2;
                if (Math.hypot(mx - x, my - y) < edgeHitRadius) {
                    const newPt = this.roundPoint({x: mx, y: my});
                    const updated = [...pts];
                    updated.splice(j, 0, newPt);
                    this.polygon.set(updated);
                    this.selectedVertex.set(j);
                    this.draggingVertex = j;
                    this.redrawCanvas();
                    return;
                }
            }

            // Also check: click near the edge line itself (not just midpoint)
            for (let i = 0; i < pts.length; i++) {
                const j = (i + 1) % pts.length;
                const dist = this.pointToSegmentDistance(x, y, pts[i].x, pts[i].y, pts[j].x, pts[j].y);
                if (dist < edgeHitRadius) {
                    // Project click onto the segment to get the insertion point
                    const proj = this.projectOntoSegment(x, y, pts[i].x, pts[i].y, pts[j].x, pts[j].y);
                    const newPt = this.roundPoint(proj);
                    const updated = [...pts];
                    updated.splice(j, 0, newPt);
                    this.polygon.set(updated);
                    this.selectedVertex.set(j);
                    this.draggingVertex = j;
                    this.redrawCanvas();
                    return;
                }
            }
        }

        // 4. Click on empty space → add new vertex at the end
        const newPt = this.roundPoint({x, y});
        this.polygon.set([...pts, newPt]);
        const newIdx = pts.length;
        this.selectedVertex.set(newIdx);
        this.draggingVertex = newIdx;
        this.redrawCanvas();
    }

    public onCanvasMouseMove(event: MouseEvent): void {
        if (this.draggingVertex < 0) return;
        const {x, y} = this.getCanvasCoords(event);
        const clampedX = Math.max(0, Math.min(1, x));
        const clampedY = Math.max(0, Math.min(1, y));

        const pts = [...this.polygon()];
        pts[this.draggingVertex] = this.roundPoint({x: clampedX, y: clampedY});
        this.polygon.set(pts);
        this.redrawCanvas();
    }

    public onCanvasMouseUp(): void {
        this.draggingVertex = -1;
    }

    // ── Vertex management ───────────────────────────────────

    public removeVertex(index: number): void {
        const pts = [...this.polygon()];
        pts.splice(index, 1);
        this.polygon.set(pts);
        this.selectedVertex.set(-1);
        this.redrawCanvas();
    }

    public clearPolygon(): void {
        this.polygon.set([]);
        this.selectedVertex.set(-1);
        this.redrawCanvas();
    }

    // ── Copy to clipboard ───────────────────────────────────

    public async copySnippet(): Promise<void> {
        const text = this.codeSnippet();
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
        } catch {
            const ta = document.createElement("textarea");
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        }
    }

    // ── Geometry helpers ────────────────────────────────────

    private roundPoint(p: Point): Point {
        return {
            x: Math.round(p.x * 100) / 100,
            y: Math.round(p.y * 100) / 100,
        };
    }

    private pointToSegmentDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - ax, py - ay);
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    private projectOntoSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): Point {
        const dx = bx - ax, dy = by - ay;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return {x: ax, y: ay};
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
        return {x: ax + t * dx, y: ay + t * dy};
    }
}
