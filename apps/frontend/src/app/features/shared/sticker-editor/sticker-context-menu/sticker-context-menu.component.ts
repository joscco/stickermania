import {
    Component, input, output, ElementRef, AfterViewChecked, ViewChild, signal,
} from '@angular/core';
import {CommonModule} from '@angular/common';

export type ContextMenuAction =
    | 'delete' | 'flipH'
    | 'zForward' | 'zBackward' | 'zFront' | 'zBack'
    | 'group' | 'ungroup'
    | 'toggleStretch' | 'duplicate';

const BTN       = 'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-stone-700 hover:bg-stone-100 active:bg-stone-200 transition-colors pointer-events-auto text-xs';
const BTN_ACTIVE = BTN + ' bg-purple-50 text-purple-700';

@Component({
    selector: 'app-sticker-context-menu',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './sticker-context-menu.component.html',
    host: {'style': 'pointer-events: none;', '[attr.data-canvas-overlay]': '""'},
})
export class StickerContextMenuComponent implements AfterViewChecked {
    protected readonly BTN        = BTN;
    protected readonly BTN_ACTIVE = BTN_ACTIVE;
    protected readonly BTN_DELETE = BTN + ' text-red-500';

    readonly visible     = input<boolean>(false);
    readonly anchorX     = input<number>(0);
    readonly anchorY     = input<number>(0);
    readonly canvasW     = input<number>(400);
    readonly canvasH     = input<number>(400);
    readonly isMulti     = input<boolean>(false);
    readonly canGroup    = input<boolean>(false);
    readonly canUngroup  = input<boolean>(false);
    readonly stretchMode = input<boolean>(false);

    readonly action = output<ContextMenuAction>();

    @ViewChild('panel') panelRef?: ElementRef<HTMLDivElement>;

    readonly clampedX = signal(0);
    readonly clampedY = signal(0);

    ngAfterViewChecked(): void {
        if (!this.visible() || !this.panelRef) {
            return;
        }
        const el  = this.panelRef.nativeElement;
        const pw  = el.offsetWidth  || 148;
        const ph  = el.offsetHeight || 200;
        const pad = 6;
        this.clampedX.set(Math.min(this.anchorX(), this.canvasW() - pw - pad));
        this.clampedY.set(Math.min(this.anchorY(), this.canvasH() - ph - pad));
    }

    emit(action: ContextMenuAction): void {this.action.emit(action);}
}

