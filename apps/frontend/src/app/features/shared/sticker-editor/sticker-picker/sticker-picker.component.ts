import {
  Component, input, output, signal, computed, effect,
  ElementRef, AfterViewInit, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {StickerDefinition, StickerPack} from '@birthday/shared';
import {StickerImgComponent} from '../sticker-img/sticker-img.component';
import {SvgComponent} from '../../svg/svg.component';

export interface StickerDragStartEvent {
  stickerId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
}
import gsap from 'gsap';

@Component({
  selector: 'app-sticker-picker',
  standalone: true,
  imports: [CommonModule, StickerImgComponent, SvgComponent],
  templateUrl: './sticker-picker.component.html',
  host: {class: 'absolute inset-0 z-50 flex flex-col overflow-hidden'},
})
export class StickerPickerComponent implements AfterViewInit {

  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly stickerPacks = input<StickerPack[]>([]);
  readonly unlockedPackIds = input<string[]>([]);
  readonly canAddMore = input<boolean>(true);
  readonly closing = input(false);

  readonly stickerDragStarted = output<StickerDragStartEvent>();
  readonly close = output<void>();

  readonly selectedPackId = signal<string | null>(null);

  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    effect(() => {
      if (this.closing()) {
        this.animateOut();
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.closing()) return;
    this.animateIn();
  }

  private animateIn(): void {
    const root = this.el.nativeElement as HTMLElement;
    const backdrop = root.querySelector('.picker-backdrop-inner') as HTMLElement | null;
    const sheet = root.querySelector('.picker-sheet') as HTMLElement | null;

    if (backdrop) {
      gsap.fromTo(backdrop, {opacity: 0}, {opacity: 1, duration: 0.2, ease: 'power2.out'});
    }
    if (sheet) {
      gsap.fromTo(sheet,
        {opacity: 0},
        { opacity: 1, duration: 0.35, ease: 'power3.out'},
      );
    }
  }

  private animateOut(): void {
    const root = this.el.nativeElement as HTMLElement;
    const backdrop = root.querySelector('.picker-backdrop-inner') as HTMLElement | null;
    const sheet = root.querySelector('.picker-sheet') as HTMLElement | null;

    if (backdrop) {
      gsap.to(backdrop, {opacity: 0, duration: 0.22, ease: 'power2.in'});
    }
    if (sheet) {
      gsap.to(sheet,
        { opacity: 0, duration: 0.25, ease: 'power3.in'},
      );
    }
  }

  readonly availablePacks = computed(() => {
    const unlocked = new Set(this.unlockedPackIds());
    return this.stickerPacks().filter(p => p.unlockedAtStart || unlocked.has(p.id));
  });

  readonly currentStickers = computed(() => {
    const catalog = this.stickerCatalog();
    const selPack = this.selectedPackId();
    if (selPack) {
      const pack = this.stickerPacks().find(p => p.id === selPack);
      if (!pack) return [];
      const ids = new Set(pack.stickerIds);
      return catalog.filter(s => ids.has(s.id));
    }
    const unlocked = new Set(this.unlockedPackIds());
    return catalog.filter(s => {
      if (!s.packId) return false;
      const pack = this.stickerPacks().find(p => p.id === s.packId);
      if (!pack) return false;
      return pack.unlockedAtStart || unlocked.has(s.packId);
    });
  });

  readonly packIconLookup = computed(() => {
    const map = new Map<string, string>();
    for (const pack of this.stickerPacks()) {
      if (pack.iconId) {
        map.set(pack.id, pack.iconId);
      }
    }
    return map;
  });

  selectPack(packId: string | null): void {
    this.selectedPackId.set(packId);
  }

  onPointerDown(event: PointerEvent, sticker: StickerDefinition): void {
    if (!this.canAddMore()) return;
    if (event.button !== 0 && event.button !== undefined) return;
    event.preventDefault();

    this.stickerDragStarted.emit({
      stickerId: sticker.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }
}
