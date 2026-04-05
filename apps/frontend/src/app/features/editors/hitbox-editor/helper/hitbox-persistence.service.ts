import {Injectable, signal, effect} from "@angular/core";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom, Subject} from "rxjs";
import {debounceTime} from "rxjs/operators";
import type {StickerDefinition} from "@birthday/shared";
import type {Point} from "./auto-hitbox.util";
import {PolygonEditService} from "./polygon-edit.service";

/** Fallback catalog when backend is unavailable */
const FALLBACK_CATALOG: StickerDefinition[] = [
    {id: "eyes_round",  imageUrl: "assets/png/sticker_eye_round.png",  categories: ["eyes"]},
    {id: "eyes_cute",   imageUrl: "assets/png/sticker_eye_cute.png",   categories: ["eyes"]},
    {id: "eyes_sleepy", imageUrl: "assets/png/sticker_eye_sleepy.png", categories: ["eyes"]},
    {id: "eyes_star",   imageUrl: "assets/png/sticker_eye_star.png",   categories: ["eyes"]},
    {id: "eyes_heart",  imageUrl: "assets/png/sticker_eye_heart.png",  categories: ["eyes"]},
];

/**
 * Handles loading the sticker catalog, persisting hitbox data,
 * and debounced auto-save.
 */
@Injectable()
export class HitboxPersistenceService {
    /** Full sticker catalog */
    public readonly catalog = signal<StickerDefinition[]>([]);

    /** Currently selected sticker */
    public readonly selectedSticker = signal<StickerDefinition | null>(null);

    /** UI feedback signals */
    public readonly saving = signal(false);
    public readonly saveStatus = signal<string>("");

    private readonly saveRequest$ = new Subject<void>();

    constructor(
        private readonly http: HttpClient,
        private readonly polygonEdit: PolygonEditService,
    ) {
        // Watch polygon for changes → debounced auto-save
        effect(() => {
            const pts = this.polygonEdit.polygon();
            if (pts.length >= 3) {
                this.saveRequest$.next();
            }
        });

        this.saveRequest$.pipe(debounceTime(800)).subscribe(() => {
            this.save();
        });
    }

    // ── Catalog ─────────────────────────────────────────────

    public async loadCatalog(): Promise<void> {
        try {
            const data = await firstValueFrom(
                this.http.get<StickerDefinition[]>("/api/sticker-catalog"),
            );
            if (data && data.length > 0) {
                this.catalog.set(data);
                return;
            }
        } catch { /* fall through to fallback */ }

        try {
            const hitboxData = await firstValueFrom(
                this.http.get<Record<string, Point[]>>("/api/hitbox-data"),
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

    // ── Sticker selection ───────────────────────────────────

    public async selectSticker(sticker: StickerDefinition): Promise<void> {
        await this.flushSave();
        this.selectedSticker.set(sticker);
        this.polygonEdit.load(sticker.hitboxPolygon ? [...sticker.hitboxPolygon] : []);
    }

    // ── Persistence ─────────────────────────────────────────

    /** Immediately persist the current polygon to the backend. */
    public async save(): Promise<void> {
        const sticker = this.selectedSticker();
        if (!sticker) return;
        const pts = this.polygonEdit.polygon();
        if (pts.length < 3) return;

        this.saving.set(true);
        this.saveStatus.set("");
        try {
            await firstValueFrom(
                this.http.put(`/api/hitbox-data/${encodeURIComponent(sticker.id)}`, {polygon: pts}),
            );
            // Update catalog entry so the sidebar shows the green dot
            const current = this.catalog();
            const idx = current.findIndex(s => s.id === sticker.id);
            if (idx >= 0) {
                const updated = [...current];
                updated[idx] = {...updated[idx], hitboxPolygon: pts};
                this.catalog.set(updated);
            }
            this.saveStatus.set("✅");
        } catch {
            this.saveStatus.set("❌");
        } finally {
            this.saving.set(false);
            setTimeout(() => this.saveStatus.set(""), 2000);
        }
    }

    /** Force an immediate save if there's a valid polygon. */
    public async flushSave(): Promise<void> {
        if (this.selectedSticker() && this.polygonEdit.isValid()) {
            await this.save();
        }
    }

    /** Clean up (call from component ngOnDestroy). */
    public destroy(): void {
        this.flushSave();
        this.saveRequest$.complete();
    }
}

