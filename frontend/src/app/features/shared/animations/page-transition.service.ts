import {Injectable} from "@angular/core";
import gsap from "gsap";

/**
 * Zentraler Service für Seiten-Übergänge.
 *
 * Komponenten registrieren ihren Host-Container beim Mounten.
 * Vor einer Navigation ruft der Aufrufer `leaveAndNavigate()` auf –
 * der Service animiert den registrierten Container aus und führt dann
 * die übergebene Aktion aus (z. B. `router.navigate()`).
 *
 * Verwendung in einer Komponente:
 *
 *   constructor(private transitions: PageTransitionService, private router: Router) {}
 *
 *   ngOnInit() {
 *     this.transitions.register(this.el.nativeElement);
 *   }
 *
 *   goSomewhere() {
 *     this.transitions.leaveAndNavigate(() => this.router.navigate(['/somewhere']));
 *   }
 */
@Injectable({providedIn: "root"})
export class PageTransitionService {
  private currentEl: HTMLElement | null = null;

  /** Registriert den Host-Container der aktuell aktiven Seite. */
  public register(el: HTMLElement): void {
    this.currentEl = el;
  }

  /** Deregistriert (beim Destroy der Komponente). */
  public unregister(el: HTMLElement): void {
    if (this.currentEl === el) this.currentEl = null;
  }

  /**
   * Fährt den aktuellen Screen mit einer kurzen Leave-Animation aus
   * und führt danach `action` aus.
   * Wenn kein Container registriert ist, wird `action` sofort ausgeführt.
   */
  public leaveAndNavigate(action: () => void, durationMs = 280): void {
    const el = this.currentEl;
    if (!el) {
      action();
      return;
    }

    gsap.to(el, {
      opacity: 0,
      y: -16,
      duration: durationMs / 1000,
      ease: "power2.in",
      overwrite: true,
      onComplete: action,
    });
  }
}

