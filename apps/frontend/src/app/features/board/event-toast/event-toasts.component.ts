import { CommonModule } from "@angular/common";
import {
  Component,
  ElementRef,
  QueryList,
  ViewChildren,
  input,
  signal,
  effect,
  untracked
} from "@angular/core";
import gsap from "gsap";

export interface UiEvent {
  id: string;
  text: string;
  createdAt: number;
}

@Component({
  selector: "app-event-toasts",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./event-toasts.component.html"
})
export class EventToastsComponent {
  public readonly events = input<UiEvent[]>([]);
  public readonly displayedEvents = signal<UiEvent[]>([]);

  @ViewChildren("toast", { read: ElementRef })
  private toastElements!: QueryList<ElementRef<HTMLElement>>;

  // Track which are currently displayed (for enter/leave)
  private displayedIds: Set<string> = new Set();
  private leavingIds: Set<string> = new Set();

  public constructor() {
    effect(() => {
      const nextEvents = this.events() ?? [];
      untracked(() => this.syncToasts(nextEvents));
    });

    // Whenever the DOM list changes, animate “layout shift” a little
    // (this gives that “toast 3 slides to toast 4 position” feeling without FLIP measurement)
    queueMicrotask(() => {
      // QueryList exists only after first render; changes covers future updates.
      // We guard in case it’s still undefined.
      this.toastElements?.changes?.subscribe(() => {
        this.animateLayoutShift();
      });
    });
  }

  private syncToasts(rawEvents: UiEvent[]): void {
    const nextTop5: UiEvent[] = [...rawEvents]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 5);

    const nextIds: Set<string> = new Set(nextTop5.map((e) => e.id));
    const currentList: UiEvent[] = this.displayedEvents();

    // Keep removed items temporarily so they can animate out
    const removedItems: UiEvent[] = currentList.filter((e) => !nextIds.has(e.id));
    const nextDisplayed: UiEvent[] = [...nextTop5, ...removedItems];

    this.displayedEvents.set(nextDisplayed);

    // Enter animations: run after DOM has likely updated (microtask)
    queueMicrotask(() => {
      this.animateEnters(nextTop5.map((e) => e.id));
      this.animateLeaves(nextIds);
    });
  }

  private animateEnters(nextVisibleIdsInOrder: string[]): void {
    const elementById = this.getElementByIdMap();

    for (const id of nextVisibleIdsInOrder) {
      if (this.displayedIds.has(id)) {
        continue;
      }

      const element = elementById.get(id);
      if (!element) {
        continue;
      }

      this.displayedIds.add(id);

      gsap.fromTo(
        element,
        { opacity: 0, y: -10, filter: "blur(2px)" },
        { opacity: 1, y: 0, filter: "blur(0px)", duration: 0.35, ease: "power2.out", overwrite: "auto" }
      );
    }
  }

  private animateLeaves(nextIds: Set<string>): void {
    const elementById = this.getElementByIdMap();
    const currentIds = Array.from(this.displayedIds);

    for (const id of currentIds) {
      if (nextIds.has(id)) {
        continue;
      }
      if (this.leavingIds.has(id)) {
        continue;
      }

      this.leavingIds.add(id);

      const element = elementById.get(id);
      if (!element) {
        this.finalizeRemove(id);
        continue;
      }

      gsap.to(element, {
        opacity: 0,
        y: 10,
        filter: "blur(2px)",
        duration: 0.30,
        ease: "power2.in",
        overwrite: "auto",
        onComplete: () => this.finalizeRemove(id)
      });

      // Safety fallback
      window.setTimeout(() => this.finalizeRemove(id), 700);
    }
  }

  private finalizeRemove(id: string): void {
    if (!this.leavingIds.has(id)) {
      return;
    }

    this.leavingIds.delete(id);
    this.displayedIds.delete(id);

    this.displayedEvents.set(this.displayedEvents().filter((e) => e.id !== id));
  }

  private animateLayoutShift(): void {
    // Subtle “everything shifts into place” animation
    // This gives you the feel of dynamic y adjustment without measuring rects.
    const elements = this.toastElements?.toArray()?.map((r) => r.nativeElement) ?? [];
    if (elements.length === 0) {
      return;
    }

    gsap.fromTo(
      elements,
      { y: 6 },
      { y: 0, duration: 0.25, ease: "power2.out", overwrite: "auto", stagger: 0.02 }
    );
  }

  private getElementByIdMap(): Map<string, HTMLElement> {
    const result = new Map<string, HTMLElement>();
    const elements = this.toastElements?.toArray() ?? [];

    for (const ref of elements) {
      const element = ref.nativeElement;
      const id = element.getAttribute("data-id");
      if (id) {
        result.set(id, element);
      }
    }
    return result;
  }
}
