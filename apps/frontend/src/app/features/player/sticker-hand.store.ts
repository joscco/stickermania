import { Injectable, signal } from "@angular/core";
import { OBJECT_TYPES, type ObjectType } from "@birthday/shared";

export interface HandSlot {
  id: string;
  type: ObjectType;
}

function randomId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

@Injectable({ providedIn: "root" })
export class StickerHandStore {
  private readonly allTypes: ObjectType[] = OBJECT_TYPES.map((entry) => entry.type);

  public readonly hand = signal<HandSlot[]>([]);
  public readonly selectedIndex = signal<number | null>(null);

  public ensureInitialized(): void {
    if (this.hand().length > 0) {
      return;
    }
    this.hand.set([this.drawSlot(), this.drawSlot(), this.drawSlot()]);
    this.selectedIndex.set(null);
  }

  public reshuffle(): void {
    this.hand.set([this.drawSlot(), this.drawSlot(), this.drawSlot()]);
    this.selectedIndex.set(null);
  }

  public selectIndex(index: number): void {
    if (index < 0 || index > 2) {
      return;
    }
    if (index >= this.hand().length) {
      return;
    }
    this.selectedIndex.set(index);
  }

  public clearSelection(): void {
    this.selectedIndex.set(null);
  }

  public getActiveSlot(): HandSlot {
    this.ensureInitialized();

    const hand = this.hand();
    const selectedIndex = this.selectedIndex();
    if (selectedIndex !== null && hand[selectedIndex]) {
      return hand[selectedIndex];
    }
    return hand[0];
  }

  public consumeActiveSlotAndRedraw(): HandSlot {
    this.ensureInitialized();

    const hand = [...this.hand()];
    const selectedIndex = this.selectedIndex();
    const activeIndex = selectedIndex !== null && hand[selectedIndex] ? selectedIndex : 0;

    const consumed = hand[activeIndex];
    hand[activeIndex] = this.drawSlot();

    // selection sticks to same index if it was explicitly chosen
    this.hand.set(hand);

    return consumed;
  }

  private drawSlot(): HandSlot {
    const randomIndex = Math.floor(Math.random() * this.allTypes.length);
    const type = this.allTypes[randomIndex] ?? this.allTypes[0];

    return { id: randomId(), type };
  }
}
