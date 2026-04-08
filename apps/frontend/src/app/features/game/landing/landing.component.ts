import {CommonModule} from "@angular/common";
import {Component, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";

const LAST_SESSION_CODE_STORAGE_KEY = "birthday_last_session_code";
const RECONNECT_STORAGE_KEY = "birthday_reconnect";

@Component({
  selector: "app-landing",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./landing.component.html",
})
export class LandingComponent implements OnInit {
  public readonly sessionCode = signal<string>("");
  public readonly lastSessionCode = signal<string | null>(
    localStorage.getItem(LAST_SESSION_CODE_STORAGE_KEY),
  );

  // Board password dialog state
  public readonly showPasswordDialog = signal<boolean>(false);
  public readonly boardPassword = signal<string>("");
  public readonly passwordError = signal<string | null>(null);
  public readonly passwordLoading = signal<boolean>(false);

  private boardAlreadyAuthed = false;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
  ) {}

  public ngOnInit(): void {
    const routeCode = this.route.snapshot.paramMap.get("sessionCode");

    if (routeCode) {
      const normalized = this.normalizeSessionCode(routeCode);
      localStorage.setItem(LAST_SESSION_CODE_STORAGE_KEY, normalized);
      void this.router.navigate(["/player"], {queryParams: {session: normalized}});
      return;
    }

    try {
      const raw = localStorage.getItem(RECONNECT_STORAGE_KEY);
      if (raw) {
        const payload = JSON.parse(raw) as {sessionCode?: string; playerId?: string};
        if (payload?.sessionCode && payload?.playerId) {
          void this.router.navigate(["/player"], {queryParams: {session: payload.sessionCode}});
          return;
        }
      }
    } catch { /* ignore */ }

    void this.checkBoardAuth();
  }

  private async checkBoardAuth(): Promise<void> {
    try {
      await firstValueFrom(this.http.get("/api/auth/board-status"));
      this.boardAlreadyAuthed = true;
    } catch {
      this.boardAlreadyAuthed = false;
    }
  }

  public onCodeInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    this.sessionCode.set(this.normalizeSessionCode(raw));
  }

  public useLastSession(): void {
    const lastCode = this.lastSessionCode();
    if (lastCode) {
      this.sessionCode.set(lastCode);
    }
  }

  public joinSession(): void {
    const code = this.sessionCode();
    if (code.length < 4) return;
    localStorage.setItem(LAST_SESSION_CODE_STORAGE_KEY, code);
    void this.router.navigate(["/player"], {queryParams: {session: code}});
  }

  public async goToBoard(): Promise<void> {
    if (this.boardAlreadyAuthed) {
      void this.router.navigate(["/board"]);
      return;
    }
    this.boardPassword.set("");
    this.passwordError.set(null);
    this.showPasswordDialog.set(true);
  }

  public async submitPassword(): Promise<void> {
    this.passwordLoading.set(true);
    this.passwordError.set(null);
    try {
      await firstValueFrom(
        this.http.post("/api/auth/board-login", {password: this.boardPassword()}),
      );
      this.showPasswordDialog.set(false);
      void this.router.navigate(["/board"]);
    } catch {
      this.passwordError.set("Falsches Passwort.");
    } finally {
      this.passwordLoading.set(false);
    }
  }

  public cancelPasswordDialog(): void {
    this.showPasswordDialog.set(false);
  }

  private normalizeSessionCode(rawValue: string): string {
    return rawValue
      .replace(/[^0-9]/g, "")
      .slice(0, 4);
  }
}
