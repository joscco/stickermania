import {CommonModule} from "@angular/common";
import {AfterViewInit, Component, ElementRef, OnDestroy, OnInit, QueryList, signal, ViewChild, ViewChildren} from "@angular/core";
import {ActivatedRoute, Router} from "@angular/router";
import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";
import {AnimOnInitDirective, AnimPresenceDirective} from '../../shared/ui/animations/anim-on-init.directive';
import {SessionRuntimeService} from '../../core/runtime/session-runtime.service';
import {BoardAuthRuntimeService} from '../../core/runtime/board-auth-runtime.service';

@Component({
  selector: "app-landing",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimPresenceDirective],
  templateUrl: "./landing.component.html",
})
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly sessionCodeLength = STICKERMANIA_CONFIG.session.codeLength;
  public readonly digitSlots = Array.from({length: this.sessionCodeLength}, (_, index) => index);

  public readonly codeDigits = signal<string[]>(Array.from({length: this.sessionCodeLength}, () => ""));
  public readonly sessionCode = signal<string>("");
  public readonly sessionCodeShakeActive = signal<boolean>(false);
  public readonly passwordShakeActive = signal<boolean>(false);
  public readonly viewportW = signal<number>(1);
  public readonly viewportH = signal<number>(1);

  // Board password dialog state
  public readonly showPasswordDialog = signal<boolean>(false);
  public readonly boardPassword = signal<string>("");
  public readonly passwordLoading = signal<boolean>(false);
  public readonly sessionJoinLoading = signal<boolean>(false);

  @ViewChildren("codeInput")
  private readonly codeInputs?: QueryList<ElementRef<HTMLInputElement>>;
  @ViewChild("landingRoot")
  private readonly landingRoot?: ElementRef<HTMLDivElement>;

  private boardAlreadyAuthed = false;
  private sessionShakeTimeout: ReturnType<typeof setTimeout> | null = null;
  private passwordShakeTimeout: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver | null = null;

  public constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly sessionRuntime: SessionRuntimeService,
    private readonly boardAuth: BoardAuthRuntimeService,
  ) {
  }

  public ngOnInit(): void {
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

    const sessionParam = this.route.snapshot.queryParamMap.get("session");
    if (sessionParam) {
      const normalized = this.normalizeSessionCode(sessionParam);
      this.setCodeFromString(normalized);
      void this.verifyAndNavigateToPlayer(normalized);
      return;
    }

    void this.checkBoardAuth();
  }

  public ngAfterViewInit(): void {
    const root = this.landingRoot?.nativeElement;
    if (!root) return;
    const updateSize = () => {
      const rect = root.getBoundingClientRect();
      this.viewportW.set(rect.width);
      this.viewportH.set(rect.height);
    };
    updateSize();
    this.resizeObserver = new ResizeObserver(updateSize);
    this.resizeObserver.observe(root);
  }

  public ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.sessionShakeTimeout) clearTimeout(this.sessionShakeTimeout);
    if (this.passwordShakeTimeout) clearTimeout(this.passwordShakeTimeout);
  }

  private async checkBoardAuth(): Promise<void> {
    this.boardAlreadyAuthed = await this.boardAuth.isBoardAuthorized();
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
      void this.router.navigate([], {queryParams: {view: "board"}});
      return;
    }
    this.boardPassword.set("");
    this.showPasswordDialog.set(true);
  }

  public async submitPassword(): Promise<void> {
    this.passwordLoading.set(true);
    try {
      await this.boardAuth.login(this.boardPassword());
      this.showPasswordDialog.set(false);
      void this.router.navigate([], {queryParams: {view: "board"}});
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
    const digits = Array.from({length: this.sessionCodeLength}, () => "");
    for (let i = 0; i < digits.length; i++) {
      digits[i] = normalized[i] ?? "";
    }
    this.syncCodeState(digits);
  }

  private async verifyAndNavigateToPlayer(code: string): Promise<void> {
    const normalized = this.normalizeSessionCode(code);
    if (normalized.length < this.sessionCodeLength || this.sessionJoinLoading()) {
      if (normalized.length < this.sessionCodeLength) this.triggerSessionCodeShake();
      return;
    }

    this.sessionJoinLoading.set(true);
    try {
      const resolved = await this.sessionRuntime.resolveSessionByCode(normalized);
      const resolvedCode = this.normalizeSessionCode(resolved.sessionCode ?? normalized);
      this.setCodeFromString(resolvedCode);
      void this.router.navigate([], {queryParams: {view: "player", session: resolvedCode}});
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
      .slice(0, this.sessionCodeLength);
  }
}
