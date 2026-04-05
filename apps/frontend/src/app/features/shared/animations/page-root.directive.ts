import {Directive, ElementRef, OnDestroy, OnInit} from "@angular/core";
import {PageTransitionService} from "./page-transition.service";

/**
 * Markiert den Host-Container als Transition-Root.
 * Registriert sich automatisch beim PageTransitionService.
 *
 * Einfach auf das Wurzel-Element einer Seite setzen:
 *   <div pageRoot class="h-screen ...">
 */
@Directive({
  selector: "[pageRoot]",
  standalone: true,
})
export class PageRootDirective implements OnInit, OnDestroy {
  public constructor(
    private readonly el: ElementRef<HTMLElement>,
    private readonly transitions: PageTransitionService,
  ) {}

  public ngOnInit(): void {
    this.transitions.register(this.el.nativeElement);
  }

  public ngOnDestroy(): void {
    this.transitions.unregister(this.el.nativeElement);
  }
}

