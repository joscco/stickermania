import {Component, signal, ViewChild, OnInit, computed} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import type {StickerDefinition, StickerPack} from "@birthday/shared";
import {firstValueFrom} from "rxjs";
import {StickerEditorComponent} from '../../shared/sticker-editor/sticker-editor.component';
import {StickerEditorToolbarComponent} from '../../shared/sticker-editor/sticker-editor-toolbar/sticker-editor-toolbar.component';

@Component({
    selector: "app-sticker-editor-test",
    standalone: true,
    imports: [CommonModule, RouterModule, StickerEditorComponent, StickerEditorToolbarComponent],
    templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent implements OnInit {
    @ViewChild("editor") editor!: StickerEditorComponent;

    public readonly maxStickers = 20;
    public readonly testCatalog = signal<StickerDefinition[]>([]);
    public readonly testPacks = signal<StickerPack[]>([]);

    public readonly allPackIds = computed(() =>
        this.testPacks().map(p => p.id));

    constructor(private readonly http: HttpClient) {}

    async ngOnInit(): Promise<void> {
        try {
            const [catalog, packs] = await Promise.all([
                firstValueFrom(this.http.get<StickerDefinition[]>("/api/sticker-catalog")),
                firstValueFrom(this.http.get<StickerPack[]>("/api/sticker-packs")),
            ]);
            if (catalog?.length) this.testCatalog.set(catalog);
            if (packs?.length) this.testPacks.set(packs);
        } catch {}
    }
}
