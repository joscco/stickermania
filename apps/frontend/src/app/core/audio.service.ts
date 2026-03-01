import { Injectable } from "@angular/core";

/**
 * Minimal audio feedback using the Web Audio API.
 * Generates tones programmatically — no external audio files needed.
 *
 * On mobile Safari/Chrome, AudioContext must be created AND resumed
 * from inside a user gesture. Call `unlockIfNeeded()` on every user
 * tap/click/pointerdown — it's cheap after the first successful unlock.
 */
@Injectable({ providedIn: "root" })
export class AudioService {
  private ctx: AudioContext | null = null;
  private unlocked = false;
  /** Queue of sounds requested before unlock completed */
  private pendingAfterUnlock: Array<() => void> = [];

  /**
   * Must be called from a user-gesture event handler (click, touchstart, pointerdown)
   * to unlock audio on iOS/Safari. Safe and cheap to call many times.
   */
  public unlockIfNeeded(): void {
    // Always try to create & resume within the user gesture callstack —
    // iOS specifically requires this.
    if (!this.ctx) {
      // Create the context inside a user gesture so iOS allows it
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    const ctx = this.ctx;

    if (ctx.state === "suspended") {
      // resume() must be called from gesture handler
      ctx.resume().then(() => {
        this.unlocked = true;
        this.drainPending();
      }).catch(() => { /* ignore */ });
    }

    if (ctx.state === "running") {
      this.unlocked = true;
    }

    // Play a silent buffer to fully unlock on iOS Safari (belt-and-suspenders)
    try {
      const buf = ctx.createBuffer(1, 1, 22050);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch { /* ignore if context not yet usable */ }
  }

  private drainPending(): void {
    const fns = this.pendingAfterUnlock.splice(0);
    for (const fn of fns) {
      try { fn(); } catch { /* ignore */ }
    }
  }

  /**
   * Returns the AudioContext if it is ready to produce sound.
   * If not yet unlocked, queues the callback for later and returns null.
   */
  private ensureCtx(fallbackFn?: () => void): AudioContext | null {
    if (!this.ctx) {
      // Context not yet created (no user gesture happened) — queue for later
      if (fallbackFn) this.pendingAfterUnlock.push(fallbackFn);
      return null;
    }
    const ctx = this.ctx;
    const state: string = ctx.state;
    if (state === "suspended") {
      ctx.resume().catch(() => {});
      // After resume() call, state might still be suspended (async).
      // Re-read the state to check:
      if ((ctx.state as string) !== "running") {
        if (fallbackFn) this.pendingAfterUnlock.push(fallbackFn);
        return null;
      }
    }
    return ctx;
  }

  /** Happy ascending chime — correct search result */
  public playSuccess(): void {
    const ctx = this.ensureCtx(() => this.playSuccess());
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 523.25, now, 0.12, 0.30);       // C5
    this.tone(ctx, 659.25, now + 0.12, 0.12, 0.30); // E5
    this.tone(ctx, 783.99, now + 0.24, 0.18, 0.35); // G5
  }

  /** Low buzz — wrong answer */
  public playError(): void {
    const ctx = this.ensureCtx(() => this.playError());
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 180, now, 0.30, 0.35, "sawtooth");
  }

  /** Shutter click — snapshot */
  public playShutter(): void {
    const ctx = this.ensureCtx(() => this.playShutter());
    if (!ctx) return;
    const now = ctx.currentTime;
    const bufferSize = Math.floor(ctx.sampleRate * 0.07);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    source.connect(gain).connect(ctx.destination);
    source.start(now);
  }

  /** Soft pop — drawing submitted */
  public playPop(): void {
    const ctx = this.ensureCtx(() => this.playPop());
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 880, now, 0.10, 0.25);
    this.tone(ctx, 1100, now + 0.05, 0.06, 0.15);
  }

  /** Short tick */
  public playTick(): void {
    const ctx = this.ensureCtx(() => this.playTick());
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 1200, now, 0.04, 0.15);
  }

  /** Round start fanfare */
  public playRoundStart(): void {
    const ctx = this.ensureCtx(() => this.playRoundStart());
    if (!ctx) return;
    const now = ctx.currentTime;
    this.tone(ctx, 523.25, now, 0.14, 0.30);
    this.tone(ctx, 659.25, now + 0.14, 0.14, 0.30);
    this.tone(ctx, 783.99, now + 0.28, 0.14, 0.30);
    this.tone(ctx, 1046.50, now + 0.42, 0.24, 0.40);
  }

  private tone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    volume: number,
    type: OscillatorType = "sine"
  ): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }
}
