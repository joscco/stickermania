import { Injectable } from "@angular/core";

/**
 * Minimal audio feedback using the Web Audio API.
 * Generates tones programmatically — no external audio files needed.
 *
 * On mobile Safari/Chrome, AudioContext must be unlocked by a user gesture.
 * Call `unlockIfNeeded()` on the first user tap/click.
 */
@Injectable({ providedIn: "root" })
export class AudioService {
  private ctx: AudioContext | null = null;
  private unlocked = false;

  /**
   * Must be called from a user-gesture event handler (click, touchstart, pointerdown)
   * to unlock audio on iOS/Safari. Safe to call multiple times.
   */
  public unlockIfNeeded(): void {
    if (this.unlocked) return;
    const ctx = this.getOrCreateCtx();
    if (ctx.state === "suspended") {
      ctx.resume().then(() => { this.unlocked = true; });
    } else {
      this.unlocked = true;
    }
    // Play a silent buffer to fully unlock on iOS
    const buf = ctx.createBuffer(1, 1, 22050);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
  }

  private getOrCreateCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  private ensureCtx(): AudioContext {
    const ctx = this.getOrCreateCtx();
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  }

  /** Happy ascending chime — correct search result */
  public playSuccess(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.tone(ctx, 523.25, now, 0.12, 0.30);       // C5
    this.tone(ctx, 659.25, now + 0.12, 0.12, 0.30); // E5
    this.tone(ctx, 783.99, now + 0.24, 0.18, 0.35); // G5
  }

  /** Low buzz — wrong answer */
  public playError(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.tone(ctx, 180, now, 0.30, 0.35, "sawtooth");
  }

  /** Shutter click — snapshot */
  public playShutter(): void {
    const ctx = this.ensureCtx();
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
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.tone(ctx, 880, now, 0.10, 0.25);
    this.tone(ctx, 1100, now + 0.05, 0.06, 0.15);
  }

  /** Short tick */
  public playTick(): void {
    const ctx = this.ensureCtx();
    const now = ctx.currentTime;
    this.tone(ctx, 1200, now, 0.04, 0.15);
  }

  /** Round start fanfare */
  public playRoundStart(): void {
    const ctx = this.ensureCtx();
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
