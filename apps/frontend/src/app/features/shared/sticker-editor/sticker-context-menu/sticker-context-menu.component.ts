import {
    Component, input, output, ElementRef, AfterViewChecked, ViewChild, signal,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import gsap from 'gsap';

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
    private hasAnimatedIn = false;

    ngAfterViewChecked(): void {
        if (!this.visible() || !this.panelRef) {
            this.hasAnimatedIn = false;
            return;
        }
        const el  = this.panelRef.nativeElement;
        const pw  = el.offsetWidth  || 148;
        const ph  = el.offsetHeight || 200;
        const pad = 6;
        this.clampedX.set(Math.min(this.anchorX(), this.canvasW() - pw - pad));
        this.clampedY.set(Math.min(this.anchorY(), this.canvasH() - ph - pad));

        // Animate in once when panel first appears
        if (!this.hasAnimatedIn) {
            this.hasAnimatedIn = true;
            this.animateIn();
        }
    }

    animateIn(): Promise<void> {
        const el = this.panelRef?.nativeElement;
        if (!el) return Promise.resolve();
        return new Promise(resolve => {
            gsap.fromTo(el,
                {opacity: 0, scale: 0.85, y: -6},
                {opacity: 1, scale: 1, y: 0, duration: 0.18, ease: 'back.out(2)', transformOrigin: 'top left', onComplete: resolve},
            );
        });
    }

    /** Animate out, then call the callback. Used by the parent before hiding the menu. */
    animateOut(): Promise<void> {
        const el = this.panelRef?.nativeElement;
        if (!el) return Promise.resolve();
        return new Promise(resolve => {
            gsap.to(el, {opacity: 0, scale: 0.9, y: -4, duration: 0.12, ease: 'power2.in', onComplete: resolve});
        });
    }

    emit(action: ContextMenuAction): void {this.action.emit(action);}
}

