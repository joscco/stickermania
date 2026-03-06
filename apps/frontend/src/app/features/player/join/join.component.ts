import { CommonModule } from "@angular/common";
import { Component, OnInit, signal } from "@angular/core";
import { ActivatedRoute, Router } from "@angular/router";

const LAST_SESSION_CODE_STORAGE_KEY = "birthday_last_session_code";

@Component({
  selector: "app-join",
  standalone: true,
  imports: [CommonModule],
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
    if (routeCode) {
      this.sessionCode.set(this.normalizeSessionCode(routeCode));
    }
  }

  public onInput(rawValue: string): void {
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
