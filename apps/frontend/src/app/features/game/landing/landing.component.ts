import {CommonModule} from "@angular/common";
import {Component, ElementRef, OnInit, QueryList, ViewChildren, signal} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {HttpClient} from "@angular/common/http";
import {firstValueFrom} from "rxjs";
import {ApiService} from '../../../core/api.service';
import {AnimOnInitDirective, AnimPresenceDirective} from '../../shared/animations/anim-on-init.directive';

@Component({
  selector: "app-landing",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimPresenceDirective],
  templateUrl: "./landing.component.html",
})
export class LandingComponent implements OnInit {
  public readonly digitSlots = [0, 1, 2, 3] as const;
  public readonly codeDigits = signal<string[]>(["", "", "", ""]);
  public readonly sessionCode = signal<string>("");
  public readonly sessionCodeShakeActive = signal<boolean>(false);
  public readonly passwordShakeActive = signal<boolean>(false);

  // Board password dialog state
  public readonly showPasswordDialog = signal<boolean>(false);
  public readonly boardPassword = signal<string>("");
  public readonly passwordLoading = signal<boolean>(false);
  public readonly sessionJoinLoading = signal<boolean>(false);

  @ViewChildren("codeInput")
  private readonly codeInputs?: QueryList<ElementRef<HTMLInputElement>>;

  private boardAlreadyAuthed = false;
  private sessionShakeTimeout: ReturnType<typeof setTimeout> | null = null;
  private passwordShakeTimeout: ReturnType<typeof setTimeout> | null = null;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly http: HttpClient,
    private readonly apiService: ApiService,
  ) {}

  public ngOnInit(): void {
    const routeCode = this.route.snapshot.paramMap.get("sessionCode");
    if (routeCode) {
      const normalized = this.normalizeSessionCode(routeCode);
      this.setCodeFromString(normalized);
      void this.verifyAndNavigateToPlayer(normalized);
      return;
    }

    const error = this.route.snapshot.queryParamMap.get("error");
    if (error === "invalid-session") {
      this.triggerSessionCodeShake();
      void this.router.navigate([], {
        relativeTo: this.route,
        queryParams: {error: null},
        queryParamsHandling: "merge",
        replaceUrl: true,
      });
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

  public onCodeDigitInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digit = this.normalizeSessionCode(input.value).slice(-1);
    this.updateDigit(index, digit);

    if (digit && index < this.digitSlots.length - 1) {
      this.focusCodeInput(index + 1);
    }
  }

  public onCodeDigitKeydown(index: number, event: KeyboardEvent): void {
    if (event.key === "Backspace") {
      event.preventDefault();
      const digits = [...this.codeDigits()];
      if (digits[index]) {
        digits[index] = "";
        this.syncCodeState(digits);
        return;
      }
      if (index > 0) {
        digits[index - 1] = "";
        this.syncCodeState(digits);
        this.focusCodeInput(index - 1);
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      this.focusCodeInput(index - 1);
      return;
    }

    if (event.key === "ArrowRight" && index < this.digitSlots.length - 1) {
      event.preventDefault();
      this.focusCodeInput(index + 1);
      return;
    }

    if (event.key === "Enter") {
      this.joinSession();
      return;
    }

    if (event.key.length === 1 && !/[0-9]/.test(event.key)) {
      event.preventDefault();
    }
  }

  public onCodePaste(index: number, event: ClipboardEvent): void {
    const pastedText = event.clipboardData?.getData("text") ?? "";
    const normalized = this.normalizeSessionCode(pastedText);
    if (!normalized) return;

    event.preventDefault();
    const digits = [...this.codeDigits()];
    for (let i = index; i < this.digitSlots.length; i++) {
      digits[i] = normalized[i - index] ?? "";
    }
    this.syncCodeState(digits);

    const nextEmptyIndex = digits.findIndex((digit) => !digit);
    this.focusCodeInput(nextEmptyIndex === -1 ? this.digitSlots.length - 1 : nextEmptyIndex);
  }

  public async joinSession(): Promise<void> {
    const code = this.sessionCode();
    await this.verifyAndNavigateToPlayer(code);
  }

  public async goToBoard(): Promise<void> {
    if (this.boardAlreadyAuthed) {
      void this.router.navigate(["/board"]);
      return;
    }
    this.boardPassword.set("");
    this.showPasswordDialog.set(true);
  }

  public async submitPassword(): Promise<void> {
    this.passwordLoading.set(true);
    try {
      await firstValueFrom(
        this.http.post("/api/auth/board-login", {password: this.boardPassword()}),
      );
      this.showPasswordDialog.set(false);
      void this.router.navigate(["/board"]);
    } catch {
      this.triggerPasswordShake();
    } finally {
      this.passwordLoading.set(false);
    }
  }

  public cancelPasswordDialog(): void {
    this.showPasswordDialog.set(false);
  }

  private updateDigit(index: number, digit: string): void {
    const digits = [...this.codeDigits()];
    digits[index] = digit;
    this.syncCodeState(digits);
  }

  private syncCodeState(digits: string[]): void {
    this.codeDigits.set(digits);
    this.sessionCode.set(digits.join(""));
  }

  private setCodeFromString(code: string): void {
    const normalized = this.normalizeSessionCode(code);
    const digits = ["", "", "", ""];
    for (let i = 0; i < digits.length; i++) {
      digits[i] = normalized[i] ?? "";
    }
    this.syncCodeState(digits);
  }

  private async verifyAndNavigateToPlayer(code: string): Promise<void> {
    const normalized = this.normalizeSessionCode(code);
    if (normalized.length < 4 || this.sessionJoinLoading()) {
      if (normalized.length < 4) this.triggerSessionCodeShake();
      return;
    }

    this.sessionJoinLoading.set(true);
    try {
      const resolved = await this.apiService.resolveSessionByCode(normalized);
      const resolvedCode = this.normalizeSessionCode(resolved.sessionCode ?? normalized);
      this.setCodeFromString(resolvedCode);
      void this.router.navigate(["/player"], {queryParams: {session: resolvedCode}});
    } catch {
      this.triggerSessionCodeShake();
    } finally {
      this.sessionJoinLoading.set(false);
    }
  }

  private focusCodeInput(index: number): void {
    const input = this.codeInputs?.get(index)?.nativeElement;
    if (!input) return;
    input.focus();
    input.select();
  }

  private triggerSessionCodeShake(): void {
    if (this.sessionShakeTimeout) clearTimeout(this.sessionShakeTimeout);
    this.sessionCodeShakeActive.set(false);
    setTimeout(() => this.sessionCodeShakeActive.set(true), 0);
    this.sessionShakeTimeout = setTimeout(() => {
      this.sessionCodeShakeActive.set(false);
      this.sessionShakeTimeout = null;
    }, 450);
  }

  private triggerPasswordShake(): void {
    if (this.passwordShakeTimeout) clearTimeout(this.passwordShakeTimeout);
    this.passwordShakeActive.set(false);
    setTimeout(() => this.passwordShakeActive.set(true), 0);
    this.passwordShakeTimeout = setTimeout(() => {
      this.passwordShakeActive.set(false);
      this.passwordShakeTimeout = null;
    }, 450);
  }


  private normalizeSessionCode(rawValue: string): string {
    return rawValue
      .replace(/[^0-9]/g, "")
      .slice(0, 4);
  }
}
