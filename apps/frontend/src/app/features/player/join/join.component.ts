import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";
import { OnScreenKeyboardComponent } from "../shared/on-screen-keyboard.component";

const LAST_SESSION_CODE_STORAGE_KEY = "birthday_last_session_code";
const RECONNECT_STORAGE_KEY = "birthday_reconnect";

@Component({
  selector: "app-join",
  standalone: true,
  imports: [CommonModule, OnScreenKeyboardComponent],
  templateUrl: "./join.component.html",
})
export class JoinComponent implements OnInit {
  public readonly sessionCode = signal<string>("");
  public readonly lastSessionCode = signal<string | null>(
    localStorage.getItem(LAST_SESSION_CODE_STORAGE_KEY),
  );

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
  ) {}

  public ngOnInit(): void {
    const routeCode = this.route.snapshot.paramMap.get("sessionCode");

    // If session code is in URL (e.g. from QR code), auto-redirect to player page
    if (routeCode) {
      const normalized = this.normalizeSessionCode(routeCode);
      localStorage.setItem(LAST_SESSION_CODE_STORAGE_KEY, normalized);
      this.router.navigate(["/player"], {
        queryParams: { session: normalized },
      });
      return;
    }

    // Auto-redirect if we have a stored reconnect payload
    try {
      const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw);
        if (payload?.sessionCode && payload?.playerId) {
          this.router.navigate(["/player"], {
            queryParams: { session: payload.sessionCode },
          });
          return;
        }
      }
    } catch { /* ignore */ }
  }

  public onInput(rawValue: string): void {
    this.sessionCode.set(this.normalizeSessionCode(rawValue));
  }

  public onKeyboardInput(rawValue: string): void {
    this.sessionCode.set(this.normalizeSessionCode(rawValue));
  }

  public useLastSession(): void {
    const lastCode = this.lastSessionCode();
    if (lastCode) {
      this.sessionCode.set(lastCode);
    }
  }

  public async continue(): Promise<void> {
    const normalizedCode = this.sessionCode();

    if (normalizedCode.length < 4) {
      return;
    }

    localStorage.setItem(LAST_SESSION_CODE_STORAGE_KEY, normalizedCode);

    await this.router.navigate(["/player"], {
      queryParams: { session: normalizedCode },
    });
  }

  private normalizeSessionCode(rawValue: string): string {
    return rawValue
      .toUpperCase()
      .replace(/[^A-Z2-9]/g, "")
      .slice(0, 5);
  }
}
