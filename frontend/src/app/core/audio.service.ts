import {Injectable, signal} from '@angular/core';

const MUSIC_SRC = 'audio/music/board-loop.mp3';
const SFX_CLICK = 'audio/sfx/click.ogg';
const SFX_ACTION = 'audio/sfx/action.ogg';
const SFX_START = 'audio/sfx/start.ogg';
const SFX_DELETE = 'audio/sfx/delete.ogg';
const SFX_SETTLE = 'audio/sfx/settle.ogg';

const SFX_PATHS = [SFX_CLICK, SFX_ACTION, SFX_START, SFX_DELETE, SFX_SETTLE];

@Injectable({providedIn: 'root'})
export class AudioService {
  public readonly musicPlaying = signal(false);

  private musicAudio: HTMLAudioElement | null = null;

  // ── Web Audio API (low-latency SFX) ──────────────────────

  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly activeSources = new Map<string, AudioBufferSourceNode>();

  private getCtx(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private async preloadAll(): Promise<void> {
    const ctx = this.getCtx();
    await Promise.all(SFX_PATHS.map(async (src) => {
      if (this.buffers.has(src)) return;
      try {
        const res = await fetch(src);
        const buf = await ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(src, buf);
      } catch {
        console.warn(`Audio: failed to preload "${src}"`);
      }
    }));
  }

  private playBuffer(src: string, volume: number): void {
    const buffer = this.buffers.get(src);
    if (!buffer) {
      this.getCtx();
      this.preloadAll();
      return;
    }
    if (!this.ctx || this.ctx.state === 'suspended') {
      this.ctx?.resume();
      return;
    }
    // Stop any previously playing instance of this same sound
    const prev = this.activeSources.get(src);
    if (prev) {
      try { prev.stop(); } catch { /* already stopped */ }
    }
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.onended = () => {
      if (this.activeSources.get(src) === source) {
        this.activeSources.delete(src);
      }
    };
    this.activeSources.set(src, source);
    source.start(0);
  }

  // ── Background music (HTML5 Audio for looping) ───────────

  private readonly TARGET_VOLUME = 0.25;
  private readonly FADE_MS = 1200;
  private fadeInterval: ReturnType<typeof setInterval> | null = null;

  public musicStart(): void {
    if (this.musicAudio) {
      return;
    }
    this.clearFade();
    this.musicAudio = new Audio(MUSIC_SRC);
    this.musicAudio.loop = true;
    this.musicAudio.volume = 0;
    this.musicAudio.play().then(() => {
      this.musicPlaying.set(true);
      this.fadeIn();
    }).catch(err => {
      console.warn('Audio: music autoplay blocked (click the music button to start)', err.message);
      this.musicAudio?.pause();
      this.musicAudio = null;
    });
  }

  public musicStop(): void {
    this.clearFade();
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
      this.musicAudio.load();
      this.musicAudio = null;
    }
    this.musicPlaying.set(false);
  }

  private fadeIn(): void {
    this.clearFade();
    const audio = this.musicAudio;
    if (!audio) return;
    const stepMs = 30;
    const steps = this.FADE_MS / stepMs;
    const increment = this.TARGET_VOLUME / steps;
    this.fadeInterval = setInterval(() => {
      if (!audio || audio.volume >= this.TARGET_VOLUME) {
        this.clearFade();
        if (audio) audio.volume = this.TARGET_VOLUME;
        return;
      }
      audio.volume = Math.min(audio.volume + increment, this.TARGET_VOLUME);
    }, stepMs);
  }

  private clearFade(): void {
    if (this.fadeInterval !== null) {
      clearInterval(this.fadeInterval);
      this.fadeInterval = null;
    }
  }

  public musicToggle(): void {
    if (this.musicPlaying()) {
      this.musicStop();
    } else {
      this.musicStart();
    }
  }

  // ── Sound effects public API ─────────────────────────────

  public playClick(): void   { this.playBuffer(SFX_CLICK, 0.35); }
  public playAction(): void  { this.playBuffer(SFX_ACTION, 0.4); }
  public playStart(): void   { this.playBuffer(SFX_START, 0.45); }
}
