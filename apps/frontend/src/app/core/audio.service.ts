import {Injectable, signal} from '@angular/core';

const MUSIC_SRC = 'audio/music/board-loop.mp3';
const SFX_CLICK = 'audio/sfx/click.mp3';
const SFX_ACTION = 'audio/sfx/action.mp3';
const SFX_START = 'audio/sfx/start.mp3';
const SFX_SUCCESS = 'audio/sfx/success.mp3';

const SFX_PATHS = [SFX_CLICK, SFX_ACTION, SFX_START, SFX_SUCCESS];

@Injectable({providedIn: 'root'})
export class AudioService {
  public readonly musicPlaying = signal(false);

  private musicAudio: HTMLAudioElement | null = null;

  // ── Web Audio API (low-latency SFX) ──────────────────────

  private ctx: AudioContext | null = null;
  private readonly buffers = new Map<string, AudioBuffer>();

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
    const source = this.ctx.createBufferSource();
    const gain = this.ctx.createGain();
    gain.gain.value = volume;
    source.buffer = buffer;
    source.connect(gain);
    gain.connect(this.ctx.destination);
    source.start(0);
  }

  // ── Background music (HTML5 Audio for looping) ───────────

  public musicStart(): void {
    if (this.musicAudio) return;
    this.musicAudio = new Audio(MUSIC_SRC);
    this.musicAudio.loop = true;
    this.musicAudio.volume = 0.25;
    this.musicAudio.play().then(() => {
      this.musicPlaying.set(true);
    }).catch(err => {
      console.warn('Audio: music autoplay blocked (click the music button to start)', err.message);
      this.musicAudio?.pause();
      this.musicAudio = null;
    });
  }

  public musicStop(): void {
    if (this.musicAudio) {
      this.musicAudio.pause();
      this.musicAudio.src = '';
      this.musicAudio.load();
      this.musicAudio = null;
    }
    this.musicPlaying.set(false);
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
  public playSuccess(): void { this.playBuffer(SFX_SUCCESS, 0.4); }
}
