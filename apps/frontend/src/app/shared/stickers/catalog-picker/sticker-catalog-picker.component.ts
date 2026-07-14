import {
  Component, input, output, signal, computed, effect,
  ElementRef, AfterViewInit, HostBinding, inject,
} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {SessionPlayer, StickerDefinition, StickerPack} from '@stickermania/shared';

export interface StickerDragStartEvent {
  stickerId: string;
  pointerId: number;
  clientX: number;
  clientY: number;
}
import gsap from 'gsap';
import {StickerImgComponent} from '../primitives/sticker-img/sticker-img.component';
import {SvgComponent} from '../../ui/svg/svg.component';
import {CachedSrcDirective} from '../../../core/assets/cached-src.directive';
import {ScrollViewportComponent} from '../../ui/scroll-viewport/scroll-viewport.component';
import {AnimOnInitDirective} from '../../ui/animations/anim-on-init.directive';

@Component({
  selector: 'app-sticker-catalog-picker',
  standalone: true,
  imports: [CommonModule, StickerImgComponent, SvgComponent, CachedSrcDirective, ScrollViewportComponent, AnimOnInitDirective],
  templateUrl: './sticker-catalog-picker.component.html',
})
export class StickerCatalogPickerComponent implements AfterViewInit {

  readonly stickerCatalog = input<StickerDefinition[]>([]);
  readonly stickerPacks = input<StickerPack[]>([]);
  readonly players = input<Record<string, SessionPlayer>>({});
  readonly playerId = input<string>("");
  readonly closing = input(false);
  readonly contained = input(false);

  @HostBinding('class')
  get hostClass(): string {
    const position = this.contained() ? 'absolute' : 'fixed';
    return `${position} h-full inset-0 z-50 flex flex-col overflow-hidden`;
  }

  readonly stickerDragStarted = output<StickerDragStartEvent>();
  readonly close = output<void>();

  readonly selectedPackId = signal<string | null>(null);
  readonly currentPackId = computed(() => {
    const selected = this.selectedPackId();
    const packs = this.availablePacks();
    if (selected && packs.some(pack => pack.id === selected)) {
      return selected;
    }
    return packs[0]?.id ?? null;
  });

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
        {opacity: 0, y: 18},
        {opacity: 1, y: 0, duration: 0.28, ease: 'power2.out'},
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
        {opacity: 0, y: 12, duration: 0.18, ease: 'power2.in'},
      );
    }
  }

  requestClose(): void {
    this.close.emit();
  }

  readonly availablePacks = computed(() => {
    return this.stickerPacks()
      .filter((pack) => pack.stickerIds.length > 0)
      .sort((left, right) => this.packSortWeight(left) - this.packSortWeight(right));
  });

  readonly currentStickers = computed(() => {
    const catalog = this.stickerCatalog();
    const selPack = this.currentPackId();
    if (selPack) {
      const pack = this.stickerPacks().find(p => p.id === selPack);
      if (!pack) return [];
      const ids = new Set(pack.stickerIds);
      return catalog.filter(s => ids.has(s.id));
    }
    return catalog
  });

  readonly contentVersion = computed(() =>
    [
      this.currentPackId() ?? "",
      ...this.availablePacks().map(pack => pack.id),
      ...this.currentStickers().map(sticker => sticker.id),
    ].join("|")
  );

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

  packOwnerId(pack: StickerPack): string | null {
    if (pack.ownerPlayerId) return pack.ownerPlayerId;
    if (!pack.id.startsWith("player-")) return null;
    return pack.id.slice("player-".length) || null;
  }

  packPlayer(pack: StickerPack): SessionPlayer | null {
    const ownerId = this.packOwnerId(pack);
    return ownerId ? this.players()[ownerId] ?? null : null;
  }

  packLabel(pack: StickerPack): string {
    return pack.name || "";
  }

  private packSortWeight(pack: StickerPack): number {
    const ownerId = this.packOwnerId(pack);
    if (ownerId === this.playerId()) return 0;
    if (ownerId) return 1;
    return 2;
  }

  onStickerSelected(event: MouseEvent, sticker: StickerDefinition): void {
    this.stickerDragStarted.emit({
      stickerId: sticker.id,
      pointerId: 0,
      clientX: event.clientX,
      clientY: event.clientY,
    });
  }

  stickerAnimDelay(index: number): number {
    const UPPER_LIMIT = 1;
    const SPEED = 0.1;
    return UPPER_LIMIT * (1 - Math.exp(-SPEED * index));
  }

}
