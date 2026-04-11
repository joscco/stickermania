import {
    Component, input, output, ElementRef, AfterViewChecked, ViewChild, signal,
} from '@angular/core';
import {CommonModule} from '@angular/common';

export type ContextMenuAction =
    | 'delete' | 'flipH'
    | 'zForward' | 'zBackward' | 'zFront' | 'zBack'
    | 'group' | 'ungroup'
    | 'toggleStretch' | 'duplicate';

/** Shared button classes for context menu items. */
const BTN = 'flex items-center gap-2 w-full px-2.5 py-1.5 rounded-lg text-left text-stone-700 hover:bg-stone-100 active:bg-stone-200 transition-colors pointer-events-auto text-xs';
const BTN_ACTIVE = BTN + ' bg-purple-50 text-purple-700';

@Component({
    selector: 'app-sticker-context-menu',
    standalone: true,
    imports: [CommonModule],
    template: `
    @if (visible()) {
      <div
        #panel
        class="absolute bg-white rounded-xl shadow-lg border border-black/8 flex flex-col gap-0.5 p-1 min-w-36 text-xs select-none"
        style="z-index: 9500;"
        [style.left.px]="clampedX()"
        [style.top.px]="clampedY()"
        (pointerdown)="$event.stopPropagation()"
      >
        <!-- Delete -->
        <button [class]="BTN + ' text-red-500'" (click)="emit('delete')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 4h12M5 4V2h6v2M4 4l.8 10h6.4L12 4" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Löschen
        </button>

        <div class="h-px bg-black/6 my-0.5"></div>

        <!-- Duplicate -->
        <button [class]="BTN" (click)="emit('duplicate')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="1" y="5" width="9" height="10" rx="1.5" stroke-linecap="round"/>
            <path d="M5 5V3a1 1 0 011-1h7a1 1 0 011 1v9a1 1 0 01-1 1h-2" stroke-linecap="round"/>
          </svg>
          Duplizieren
        </button>

        <!-- Flip -->
        <button [class]="BTN" (click)="emit('flipH')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M8 2v12M3 5l2.5 3L3 11M13 5l-2.5 3L13 11" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Spiegeln
        </button>

        @if (!isMulti()) {
          <!-- Stretch mode -->
          <button [class]="stretchMode() ? BTN_ACTIVE : BTN" (click)="emit('toggleStretch')">
            <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
              <rect x="2" y="5" width="12" height="6" rx="1" stroke-linecap="round"/>
              <path d="M5 8h6M2 8H0M16 8h-2" stroke-linecap="round"/>
            </svg>
            {{ stretchMode() ? 'Verformen beenden' : 'Verformen' }}
          </button>
        }

        <div class="h-px bg-black/6 my-0.5"></div>

        <!-- Z-order -->
        <button [class]="BTN" (click)="emit('zFront')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 12l6-8 6 8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 8l6-4 6 4" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>
          </svg>
          Ganz nach vorne
        </button>
        <button [class]="BTN" (click)="emit('zForward')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 11l6-6 6 6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Eine Ebene nach vorne
        </button>
        <button [class]="BTN" (click)="emit('zBackward')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 5l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Eine Ebene nach hinten
        </button>
        <button [class]="BTN" (click)="emit('zBack')">
          <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
            <path d="M2 4l6 8 6-8" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M2 8l6 4 6-4" stroke-linecap="round" stroke-linejoin="round" opacity=".4"/>
          </svg>
          Ganz nach hinten
        </button>

        @if (canGroup() || canUngroup()) {
          <div class="h-px bg-black/6 my-0.5"></div>
          @if (canGroup()) {
            <button [class]="BTN" (click)="emit('group')">
              <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/>
                <rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/>
                <path d="M4 7v2M12 7v2M7 4h2M7 12h2" stroke-linecap="round"/>
              </svg>
              Gruppieren
            </button>
          }
          @if (canUngroup()) {
            <button [class]="BTN" (click)="emit('ungroup')">
              <svg viewBox="0 0 16 16" class="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8">
                <rect x="1" y="1" width="6" height="6" rx="1" stroke-dasharray="2 1.5"/>
                <rect x="9" y="1" width="6" height="6" rx="1" stroke-dasharray="2 1.5"/>
                <rect x="1" y="9" width="6" height="6" rx="1" stroke-dasharray="2 1.5"/>
                <rect x="9" y="9" width="6" height="6" rx="1" stroke-dasharray="2 1.5"/>
              </svg>
              Gruppierung aufheben
            </button>
          }
        }
      </div>
    }
  `,
    host: {style: 'pointer-events: none;', 'data-canvas-overlay': ''},
})
export class StickerContextMenuComponent implements AfterViewChecked {
    protected readonly BTN       = BTN;
    protected readonly BTN_ACTIVE = BTN_ACTIVE;

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
        if (!this.visible() || !this.panelRef) return;
        const el = this.panelRef.nativeElement;
        const pw = el.offsetWidth  || 148;
        const ph = el.offsetHeight || 200;
        const pad = 6;
        this.clampedX.set(Math.min(this.anchorX(), this.canvasW() - pw - pad));
        this.clampedY.set(Math.min(this.anchorY(), this.canvasH() - ph - pad));
    }

    emit(action: ContextMenuAction): void {
        this.action.emit(action);
    }
}

