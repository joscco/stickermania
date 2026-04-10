import {CommonModule} from "@angular/common";
import {Component, OnInit, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";

@Component({
  selector: "app-landing",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./landing.component.html",
})
export class LandingComponent implements OnInit {
  public readonly sessionCode = signal<string>("");

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
      void this.router.navigate(["/player"], {queryParams: {session: normalized}});
      return;
    }

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

  public joinSession(): void {
    const code = this.sessionCode();
    if (code.length < 4) return;
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
