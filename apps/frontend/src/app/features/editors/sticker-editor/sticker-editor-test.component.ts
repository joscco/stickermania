import {Component, signal, ViewChild, OnInit} from "@angular/core";
import {CommonModule} from "@angular/common";
import {RouterModule} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import type {StickerDefinition} from "@birthday/shared";
import {StickerEditorComponent} from '../../game/shared/sticker-editor/sticker-editor.component';
import {firstValueFrom} from "rxjs";

@Component({
    selector: "app-sticker-editor-test",
    standalone: true,
    imports: [CommonModule, RouterModule, StickerEditorComponent],
    templateUrl: "./sticker-editor-test.component.html",
})
export class StickerEditorTestComponent implements OnInit {
    @ViewChild("editor") editor!: StickerEditorComponent;

    public readonly maxStickers = 20;
    public readonly testCatalog = signal<StickerDefinition[]>([]);

    constructor(private readonly http: HttpClient) {}

    async ngOnInit(): Promise<void> {
        try {
            const catalog = await firstValueFrom(
                this.http.get<StickerDefinition[]>("/api/sticker-catalog")
            );
            if (catalog?.length) this.testCatalog.set(catalog);
        } catch {}
    }
}
