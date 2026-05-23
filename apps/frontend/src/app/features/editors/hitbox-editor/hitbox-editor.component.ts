import {Component, signal, computed, ElementRef, ViewChild, OnDestroy, OnInit, AfterViewInit, HostListener} from "@angular/core";
import {CommonModule} from "@angular/common";
import {FormsModule} from "@angular/forms";
import {RouterModule} from "@angular/router";
import {PolygonEditService} from './helper/polygon-edit.service';
import {HitboxPersistenceService} from './helper/hitbox-persistence.service';
import {EditorInteractionHandler} from './helper/editor-interaction.handler';
import {autoDetectHitbox} from './helper/auto-hitbox.util';
import {StickerImgComponent} from '../../shared/sticker-editor/sticker-img/sticker-img.component';
import {SvgComponent} from '../../shared/svg/svg.component';
import {resolveToImgUrl} from '../../shared/sticker-editor/sprite-url.util';

/**
 * Visual hitbox polygon editor for stickers.
 *
 * Thin orchestrator — delegates polygon state to {@link PolygonEditService},
 * persistence to {@link HitboxPersistenceService}, and mouse/keyboard
 * interaction to {@link EditorInteractionHandler}.
 *
 * Route: /hitbox-editor
 */
@Component({
    selector: "app-hitbox-editor",
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule, StickerImgComponent, SvgComponent],
    templateUrl: "./hitbox-editor.component.html",
    providers: [PolygonEditService, HitboxPersistenceService, EditorInteractionHandler],
})
export class HitboxEditorComponent implements OnInit, AfterViewInit, OnDestroy {
    @ViewChild("editorArea") editorArea!: ElementRef<HTMLDivElement>;

    /**
     * How far beyond the image edge (as a fraction of the image size)
     * points can be placed. 0.05 = 5 % overflow on each side.
     */
    public readonly overflowFraction = 0;

    /** Auto-detect UI state */
    public readonly autoDetecting = signal(false);
    public readonly tolerance = signal(0.02);
    public readonly alphaThreshold = signal(20);

    /** Natural image dimensions — updated when a sticker image loads */
    private readonly imgNatWidth = signal(1);
    private readonly imgNatHeight = signal(1);

    /** Available container dimensions — updated via ResizeObserver */
    private readonly containerWidth = signal(600);
    private readonly containerHeight = signal(400);

    /** Pixel padding derived from fitted image size and overflowFraction */
    public readonly edgePaddingX = computed(() =>
        Math.ceil(this.fittedWidth() * this.overflowFraction));

    public readonly edgePaddingY = computed(() =>
        Math.ceil(this.fittedHeight() * this.overflowFraction));

    /** Fitted image width (fills available space minus overflow margins, preserves aspect ratio) */
    public readonly fittedWidth = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const shrink = 1 + this.overflowFraction * 2; // leave room for overflow on each side
        const cw = Math.floor(this.containerWidth() / shrink);
        const ch = Math.floor(this.containerHeight() / shrink);
        if (cw <= 0 || ch <= 0) return 100;
        return cw / ch > aspect ? Math.floor(ch * aspect) : cw;
    });

    /** Fitted image height */
    public readonly fittedHeight = computed(() => {
        const aspect = this.imgNatWidth() / this.imgNatHeight();
        const shrink = 1 + this.overflowFraction * 2;
        const cw = Math.floor(this.containerWidth() / shrink);
        const ch = Math.floor(this.containerHeight() / shrink);
        if (cw <= 0 || ch <= 0) return 100;
        return cw / ch > aspect ? ch : Math.floor(cw / aspect);
    });

    /** Interactive wrapper width (image + overflow padding on each side) */
    public readonly wrapperWidth = computed(() =>
        this.fittedWidth() + this.edgePaddingX() * 2);

    /** Interactive wrapper height (image + overflow padding on each side) */
    public readonly wrapperHeight = computed(() =>
        this.fittedHeight() + this.edgePaddingY() * 2);

    /** SVG points string in pixel coordinates (offset by edge padding) */
    public readonly svgPixelPoints = computed(() => {
        const w = this.fittedWidth();
        const h = this.fittedHeight();
        const px = this.edgePaddingX();
        const py = this.edgePaddingY();
        return this.poly.polygon().map(p => `${p.x * w + px},${p.y * h + py}`).join(" ");
    });

    public readonly resolvedDisplayUrl = signal<string>('');
    private _currentDisplayBlob: string | null = null;

    /** Overlay bounds in pixel coordinates */
    public readonly overlayPixel = computed(() => {
        const ob = this.persistence.overlayBounds();
        if (!ob) return null;
        const w = this.fittedWidth();
        const h = this.fittedHeight();
        const px = this.edgePaddingX();
        const py = this.edgePaddingY();
        const x = (ob.x - ob.w / 2) * w + px;
        const y = (ob.y - ob.h / 2) * h + py;
        const pw = ob.w * w;
        const ph = ob.h * h;
        return {x, y, w: pw, h: ph};
    });

    constructor(
        public readonly poly: PolygonEditService,
        public readonly persistence: HitboxPersistenceService,
        public readonly interaction: EditorInteractionHandler,
    ) {}

    private resizeObserver: ResizeObserver | null = null;

    async ngOnInit(): Promise<void> {
        await this.persistence.loadCatalog();
    }

    ngAfterViewInit(): void {
        this.resizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                this.containerWidth.set(Math.floor(entry.contentRect.width));
                this.containerHeight.set(Math.floor(entry.contentRect.height));
            }
        });
        if (this.editorArea?.nativeElement) {
            this.resizeObserver.observe(this.editorArea.nativeElement);
        }
    }

    ngOnDestroy(): void {
        this.resizeObserver?.disconnect();
        this.persistence.destroy();
    }

    // ── Overlay bounds editing ──────────────────────────────

    /** Edit mode: 'hitbox' = polygon editing, 'overlay' = overlay bounds */
    public readonly editMode = signal<'hitbox' | 'overlay'>('hitbox');

    private overlayDrag: {handle: string; startX: number; startY: number; startBounds: {x: number; y: number; w: number; h: number}} | null = null;

    public onOverlayMouseDown(event: MouseEvent, handle: string): void {
        event.stopPropagation();
        event.preventDefault();
        const ob = this.persistence.overlayBounds();
        if (!ob) return;
        this.overlayDrag = {handle, startX: event.clientX, startY: event.clientY, startBounds: {...ob}};

        const fw = this.fittedWidth();
        const fh = this.fittedHeight();

        const onMove = (me: MouseEvent) => {
            if (!this.overlayDrag) return;
            const dx = (me.clientX - this.overlayDrag.startX) / fw;
            const dy = (me.clientY - this.overlayDrag.startY) / fh;
            const sb = this.overlayDrag.startBounds;

            const left = sb.x - sb.w / 2;
            const right = sb.x + sb.w / 2;
            const top = sb.y - sb.h / 2;
            const bottom = sb.y + sb.h / 2;

            let nLeft = left, nRight = right, nTop = top, nBottom = bottom;

            if (handle === 'tl') { nLeft = left + dx; nTop = top + dy; }
            else if (handle === 'tr') { nRight = right + dx; nTop = top + dy; }
            else if (handle === 'bl') { nLeft = left + dx; nBottom = bottom + dy; }
            else if (handle === 'br') { nRight = right + dx; nBottom = bottom + dy; }

            const nx = (nLeft + nRight) / 2;
            const ny = (nTop + nBottom) / 2;
            const nw = Math.max(0.02, nRight - nLeft);
            const nh = Math.max(0.02, nBottom - nTop);

            this.persistence.overlayBounds.set({x: nx, y: ny, w: nw, h: nh});
        };

        const onUp = () => {
            this.overlayDrag = null;
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }

    // ── Template callbacks ───────────────────────────────────

    private defaultOverlayBounds(): {x: number; y: number; w: number; h: number} {
        return {x: 0.5, y: 0.5, w: 1, h: 1};
    }

    public async selectSticker(sticker: import('@birthday/shared').StickerDefinition): Promise<void> {
        await this.persistence.selectSticker(sticker);
        if (!this.persistence.overlayBounds()) {
            this.persistence.overlayBounds.set(this.defaultOverlayBounds());
        }
        // Reset dimensions while loading
        this.imgNatWidth.set(1);
        this.imgNatHeight.set(1);
        // Revoke previous blob if any
        if (this._currentDisplayBlob) {
            URL.revokeObjectURL(this._currentDisplayBlob);
            this._currentDisplayBlob = null;
        }
        // Resolve to a loadable URL. For sprite: URLs we also get the viewBox
        // dimensions directly — no need to wait for onImageLoaded.
        const { url, intrinsicWidth, intrinsicHeight } = await resolveToImgUrl(sticker.imageUrl, 512);
        this._currentDisplayBlob = url;
        if (intrinsicWidth && intrinsicHeight) {
            this.imgNatWidth.set(intrinsicWidth);
            this.imgNatHeight.set(intrinsicHeight);
        }
        this.resolvedDisplayUrl.set(url);
    }

    public onImageLoaded(event: Event): void {
        const img = event.target as HTMLImageElement;
        // Only trust naturalWidth/Height for non-SVG images (PNG/JPEG).
        // For SVG blob URLs the values are unreliable across browsers;
        // we already set the dimensions from the viewBox in selectSticker().
        if (img.naturalWidth > 0 && img.naturalHeight > 0 && !this._currentDisplayBlob) {
            this.imgNatWidth.set(img.naturalWidth);
            this.imgNatHeight.set(img.naturalHeight);
        }
    }

    public async runAutoDetect(): Promise<void> {
        const sticker = this.persistence.selectedSticker();
        if (!sticker) {
          return;
        }
        this.autoDetecting.set(true);
        try {
            const result = await autoDetectHitbox(sticker.imageUrl, this.tolerance(), this.alphaThreshold());
            if (result.length >= 3) {
                this.poly.load(result);
            }
        } finally {
            this.autoDetecting.set(false);
        }
    }

    @HostListener("window:keydown", ["$event"])
    onKeyDown(event: KeyboardEvent): void {
        if (this.editMode() !== 'hitbox') return;
        if (this.interaction.onKeyDown(event)) {
            event.preventDefault();
        }
    }
}
