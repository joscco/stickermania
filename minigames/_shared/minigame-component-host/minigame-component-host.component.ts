import {
  Component,
  ComponentRef,
  OnChanges,
  OnDestroy,
  Type,
  ViewChild,
  ViewContainerRef,
  input,
  output,
} from "@angular/core";

type OutputSubscription = {
  unsubscribe: () => void;
};

type ComponentWithPlayerEvent = {
  playerEvent?: {
    subscribe: (callback: (event: unknown) => void) => OutputSubscription;
  };
};

@Component({
  selector: "sm-minigame-component-host",
  standalone: true,
  template: "<ng-container #host />",
})
export class MinigameComponentHostComponent implements OnChanges, OnDestroy {
  public readonly componentType = input.required<Type<unknown>>();
  public readonly state = input.required<unknown>();
  public readonly playerEvent = output<unknown>();

  @ViewChild("host", {read: ViewContainerRef, static: true})
  private readonly host!: ViewContainerRef;

  private componentRef: ComponentRef<unknown> | null = null;
  private eventSubscription: OutputSubscription | null = null;

  public ngOnChanges(): void {
    const componentType = this.componentType();

    if (!this.componentRef || this.componentRef.componentType !== componentType) {
      this.recreateComponent(componentType);
    }

    this.componentRef?.setInput("state", this.state());
  }

  public ngOnDestroy(): void {
    this.eventSubscription?.unsubscribe();
    this.componentRef?.destroy();
  }

  private recreateComponent(componentType: Type<unknown>): void {
    this.eventSubscription?.unsubscribe();
    this.componentRef?.destroy();
    this.host.clear();

    this.componentRef = this.host.createComponent(componentType);
    const instance = this.componentRef.instance as ComponentWithPlayerEvent;
    this.eventSubscription = instance.playerEvent?.subscribe((event) => {
      this.playerEvent.emit(event);
    }) ?? null;
  }
}
