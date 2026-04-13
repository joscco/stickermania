import {Component, computed, inject, ViewChild, OnDestroy} from "@angular/core";
import {CommonModule} from "@angular/common";
import {StickerPlayerService} from '../../../services/sticker-player.service';
import {GameSessionStore} from '../../../../../core/challenge.store';
import {ApiService} from '../../../../../core/api.service';
import {AnimOnInitDirective} from '../../../../shared/animations/anim-on-init.directive';
import type {StickerDefinition, StickerPlacement} from "@birthday/shared";
import {StickerEditorComponent} from '../../../../shared/sticker-editor/sticker-editor.component';

@Component({
    selector: "app-player-building",
    standalone: true,
    imports: [CommonModule, StickerEditorComponent, AnimOnInitDirective],
    templateUrl: "./player-building.component.html",
    host: {"class": "flex-1 flex flex-col overflow-hidden"},
})
export class PlayerBuildingComponent implements OnDestroy {
    public readonly stickerService = inject(StickerPlayerService);
    private readonly sessionStore  = inject(GameSessionStore);
    private readonly apiService    = inject(ApiService);

    @ViewChild("editor") editor!: StickerEditorComponent;

    /** Catalog entries limited to the sticker IDs in the player's current hand. */
    public readonly handStickers = computed<StickerDefinition[]>(() => {
        const hand = this.stickerService.myHand();
        if (!hand) return [];
        const ids = new Set(hand.stickerIds);
        return this.stickerService.stickerCatalog().filter(s => ids.has(s.id));
    });

    ngOnDestroy(): void {}

    public get placements(): StickerPlacement[] {
        return this.editor?.placements() ?? [];
    }

    public async submitCollage(): Promise<void> {
        const placements = this.editor?.placements() ?? [];
        if (placements.length === 0) return;

        let imageDataUrl: string | null = null;
        try { imageDataUrl = await this.editor.toDataUrl(); } catch {}

        this.stickerService.submitCollage(placements);

        if (imageDataUrl) this.uploadSnapshot(imageDataUrl);
    }

    private async uploadSnapshot(imageDataUrl: string): Promise<void> {
        const sessionId = this.sessionStore.sessionId();
        const playerId  = this.sessionStore.playerId();
        if (!sessionId || !playerId) return;

        let collageId: string | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
            const ms = this.stickerService.gameState();
            if (ms) {
                const mine = (ms.submissions[ms.currentRoundIndex] ?? []).find(s => s.playerId === playerId);
                if (mine) { collageId = mine.id; break; }
            }
            await new Promise(r => setTimeout(r, 200));
        }
        if (!collageId) return;
        try { await this.apiService.uploadCollageImage(sessionId, playerId, collageId, imageDataUrl); } catch {}
    }
}
