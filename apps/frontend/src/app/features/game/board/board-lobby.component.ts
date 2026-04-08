import { CommonModule } from "@angular/common";
import { Component, OnInit, output, signal } from "@angular/core";
import type { GameModeId } from "@birthday/shared";
import JSZip from "jszip";
import { ApiService, type SessionSummary } from '../../../core/api.service';
import {AnimOnInitDirective, AnimGroupDirective} from '../../shared/animations/anim-on-init.directive';
import {PageRootDirective} from '../../shared/animations/page-root.directive';
import {PageTransitionService} from '../../shared/animations/page-transition.service';

@Component({
  selector: "app-board-lobby",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, PageRootDirective],
  templateUrl: "./board-lobby.component.html",
})
export class BoardLobbyComponent implements OnInit {
  public readonly sessionCreated = output<string>();

  public readonly selectedMode = signal<GameModeId>("sticker-collage");
  public readonly isCreating = signal(false);
  public readonly errorText = signal<string | null>(null);
  public readonly sessions = signal<SessionSummary[]>([]);
  public readonly isLoadingSessions = signal(true);

  /** Per-session download state: idle | loading | done | error */
  public readonly downloadStates = signal<Map<string, "idle" | "loading" | "done" | "error">>(new Map());

  public readonly gameModes: { id: GameModeId; icon: string; label: string; description: string }[] = [
    { id: "sticker-collage", icon: "assets/png/select_icon_sticker_game.png", label: "Stickermania", description: "Sticker-Collagen bauen & bewerten" },
  ];

  public constructor(
    private readonly api: ApiService,
    private readonly transitions: PageTransitionService,
  ) {}

  public async ngOnInit(): Promise<void> {
    await this.loadSessions();
  }

  public async createSession(): Promise<void> {
    this.isCreating.set(true);
    this.errorText.set(null);
    try {
      const session = await this.api.createSession(this.selectedMode());
      this.transitions.leaveAndNavigate(() => this.sessionCreated.emit(session.sessionCode));
    } catch {
      this.errorText.set("Session konnte nicht erstellt werden.");
      this.isCreating.set(false);
    }
  }

  public openSession(code: string): void {
    this.transitions.leaveAndNavigate(() => this.sessionCreated.emit(code));
  }

  public async deleteSession(sessionId: string, event: Event): Promise<void> {
    event.stopPropagation();
    try {
      await this.api.deleteSession(sessionId);
      this.sessions.set(this.sessions().filter((s) => s.sessionId !== sessionId));
    } catch { /* ignore */ }
  }

  public downloadState(sessionId: string): "idle" | "loading" | "done" | "error" {
    return this.downloadStates().get(sessionId) ?? "idle";
  }

  public async downloadSessionAssets(sessionId: string, sessionCode: string, event: Event): Promise<void> {
    event.stopPropagation();

    const states = new Map(this.downloadStates());
    states.set(sessionId, "loading");
    this.downloadStates.set(states);

    try {
      const assets = await this.api.getSessionAssets(sessionId);
      if (assets.length === 0) {
        const s = new Map(this.downloadStates());
        s.set(sessionId, "error");
        this.downloadStates.set(s);
        return;
      }

      const zip = new JSZip();
      await Promise.all(assets.map(async (asset) => {
        const response = await fetch(asset.publicUrl);
        const blob = await response.blob();
        const folder = asset.type === "avatar" ? "avatare" : "collagen";
        zip.file(`${folder}/${asset.filename}`, blob);
      }));

      const content = await zip.generateAsync({type: "blob"});
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `stickermania-${sessionCode}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      const s = new Map(this.downloadStates());
      s.set(sessionId, "done");
      this.downloadStates.set(s);
    } catch {
      const s = new Map(this.downloadStates());
      s.set(sessionId, "error");
      this.downloadStates.set(s);
    }
  }

  public modeLabel(mode: string): string {
    return this.gameModes.find((m) => m.id === mode)?.label ?? mode;
  }

  public timeAgo(timestamp: number): string {
    const diffMs = Date.now() - timestamp;
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 1) return "gerade eben";
    if (minutes < 60) return `vor ${minutes} Min.`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `vor ${hours} Std.`;
    return `vor ${Math.floor(hours / 24)} Tag(en)`;
  }

  private async loadSessions(): Promise<void> {
    this.isLoadingSessions.set(true);
    try {
      this.sessions.set(await this.api.listSessions());
    } catch { /* ignore */ }
    this.isLoadingSessions.set(false);
  }
}

