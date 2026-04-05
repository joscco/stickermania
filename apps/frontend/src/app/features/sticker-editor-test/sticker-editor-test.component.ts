import {Component, signal, ViewChild} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import type {StickerPlacement, StickerDefinition} from "@birthday/shared";
import {StickerCanvasComponent} from "../sticker-game/player/sticker-canvas/sticker-canvas.component";

/**
 * Standalone test editor for the sticker canvas.
 * No WebSocket or session required — fully self-contained with a hardcoded catalog.
 * Navigate to /editor to use.
 */
@Component({
    selector: "app-sticker-editor-test",
    standalone: true,
    imports: [CommonModule, RouterModule, StickerCanvasComponent],
    templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent {
    @ViewChild("stickerCanvas") stickerCanvas!: StickerCanvasComponent;

    public readonly placements = signal<StickerPlacement[]>([]);
    public readonly maxStickers = 20;

    /**
     * Built-in test catalog with placeholder stickers.
     * Uses the same assets as the real game — no server needed.
     */
    public readonly testCatalog: StickerDefinition[] = [
        // Eyes
        {id: "eyes_round", imageUrl: "assets/png/sticker_eye_round.png", categories: ["eyes"]},
        {id: "eyes_cute", imageUrl: "assets/png/sticker_eye_cute.png", categories: ["eyes"]},
        {id: "eyes_angry", imageUrl: "assets/png/sticker_eye_angry.png", categories: ["eyes"]},
        {id: "eyes_heart", imageUrl: "assets/png/sticker_eye_heart.png", categories: ["eyes"],
            hitboxPolygon: [{x:0.5,y:0},{x:0.62,y:0.38},{x:1,y:0.38},{x:0.69,y:0.6},{x:0.81,y:1},{x:0.5,y:0.75},{x:0.19,y:1},{x:0.31,y:0.6},{x:0,y:0.38},{x:0.38,y:0.38}]},
        // Mouths
        {id: "mouth_smile", imageUrl: "assets/png/sticker_mouth_smile.png", categories: ["mouth"]},
        {id: "mouth_open", imageUrl: "assets/png/sticker_mouth_open.png", categories: ["mouth"]},
        // Noses
        {id: "nose_round", imageUrl: "assets/png/sticker_nose_round.png", categories: ["nose"]},
        {id: "nose_pointy", imageUrl: "assets/png/sticker_nose_pointy.png", categories: ["nose"],
            hitboxPolygon: [{x:0.5,y:0},{x:1,y:1},{x:0,y:1}]},
        // Shapes
        {id: "shape_circle", imageUrl: "assets/png/sticker_shape_circle.png", categories: ["shape"]},
        {id: "shape_triangle", imageUrl: "assets/png/sticker_shape_triangle.png", categories: ["shape"],
            hitboxPolygon: [{x:0.5,y:0},{x:1,y:1},{x:0,y:1}]},
        {id: "shape_star", imageUrl: "assets/png/sticker_shape_star.png", categories: ["shape"],
            hitboxPolygon: [{x:0.5,y:0},{x:0.62,y:0.38},{x:1,y:0.38},{x:0.69,y:0.6},{x:0.81,y:1},{x:0.5,y:0.75},{x:0.19,y:1},{x:0.31,y:0.6},{x:0,y:0.38},{x:0.38,y:0.38}]},
        {id: "shape_blob", imageUrl: "assets/png/sticker_shape_blob.png", categories: ["shape"]},
        // Accessories
        {id: "acc_hat", imageUrl: "assets/png/sticker_acc_hat.png", categories: ["accessory"]},
        {id: "acc_crown", imageUrl: "assets/png/sticker_acc_crown.png", categories: ["accessory"],
            hitboxPolygon: [{x:0.1,y:1},{x:0,y:0.4},{x:0.25,y:0.7},{x:0.5,y:0},{x:0.75,y:0.7},{x:1,y:0.4},{x:0.9,y:1}]},
        {id: "acc_bowtie", imageUrl: "assets/png/sticker_acc_bowtie.png", categories: ["accessory"],
            hitboxPolygon: [{x:0.5,y:0.3},{x:1,y:0},{x:1,y:1},{x:0.5,y:0.7},{x:0,y:1},{x:0,y:0}]},
        // Fruits
        {id: "fruit_apple", imageUrl: "assets/png/sticker_fruit_apple.png", categories: ["fruit"]},
        {id: "fruit_banana", imageUrl: "assets/png/sticker_fruit_banana.png", categories: ["fruit"]},
    ];

    public addStickerToCanvas(stickerId: string): void {
        const current = this.placements();
        if (current.length >= this.maxStickers) return;

        const maxZ = current.length > 0 ? Math.max(...current.map(p => p.zIndex)) : 0;
        const newPlacement: StickerPlacement = {
            instanceId: this.stickerCanvas?.generateInstanceId()
                ?? `inst_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            stickerId,
            x: 40 + Math.random() * 200,
            y: 40 + Math.random() * 200,
            rotation: 0,
            scale: 1,
            zIndex: maxZ + 1,
        };
        this.placements.set([...current, newPlacement]);
    }

    public onPlacementsChanged(placements: StickerPlacement[]): void {
        this.placements.set(placements);
    }

    public onStickerRemoved(instanceId: string): void {
        this.placements.set(this.placements().filter(p => p.instanceId !== instanceId));
    }

    public clearCanvas(): void {
        this.placements.set([]);
    }

    public getStickerUrl(stickerId: string): string {
        return this.testCatalog.find(s => s.id === stickerId)?.imageUrl ?? "";
    }
}

