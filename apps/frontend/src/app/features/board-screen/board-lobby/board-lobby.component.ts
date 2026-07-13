import {CommonModule} from "@angular/common";
import {Component, OnInit, output, signal} from "@angular/core";
import JSZip from "jszip";
import {buildStaticBoardExportZip} from "../export/board-static-export";
import {PageTransitionService} from '../../../shared/ui/animations/page-transition.service';
import {AnimGroupDirective, AnimOnInitDirective, AnimPresenceDirective} from '../../../shared/ui/animations/anim-on-init.directive';
import {PageRootDirective} from '../../../shared/ui/animations/page-root.directive';
import {SvgComponent} from '../../../shared/ui/svg/svg.component';
import {type SessionSummary} from '../../../core/api/session-api.service';
import {SessionRuntimeService} from '../../../core/runtime/session-runtime.service';

@Component({
  selector: "app-board-lobby",
  standalone: true,
  imports: [CommonModule, AnimOnInitDirective, AnimGroupDirective, PageRootDirective, AnimPresenceDirective, SvgComponent],
  templateUrl: "./board-lobby.component.html",
  host: {"class": "h-full"}
})
export class BoardLobbyComponent implements OnInit {
  public readonly sessionCreated = output<string>();

  public readonly isCreating = signal(false);
  public readonly errorText = signal<string | null>(null);
  public readonly sessions = signal<SessionSummary[]>([]);
  public readonly isLoadingSessions = signal(true);
  public readonly leavingSessionIds = signal<Set<string>>(new Set());

  /** Per-session download state: idle | loading | done | error */
  public readonly downloadStates = signal<Map<string, "idle" | "loading" | "done" | "error">>(new Map());
  public readonly exportStates = signal<Map<string, "idle" | "loading" | "done" | "error">>(new Map());

  private readonly sessionLeaveDurationMs = 320;

  public constructor(
    private readonly sessionRuntime: SessionRuntimeService,
    private readonly transitions: PageTransitionService,
  ) {}

  public async ngOnInit(): Promise<void> {
    await this.loadSessions();
  }

  public async createSession(): Promise<void> {
    this.isCreating.set(true);
    this.errorText.set(null);
    try {
      const session = await this.sessionRuntime.createSession();
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
    if (this.isSessionLeaving(sessionId)) return;

    try {
      await this.sessionRuntime.deleteSession(sessionId);
      this.startSessionLeave(sessionId);
    } catch { /* ignore */ }
  }

  public downloadState(sessionId: string): "idle" | "loading" | "done" | "error" {
    return this.downloadStates().get(sessionId) ?? "idle";
  }

  public exportState(sessionId: string): "idle" | "loading" | "done" | "error" {
    return this.exportStates().get(sessionId) ?? "idle";
  }

  public async downloadSessionAssets(sessionId: string, sessionCode: string, event: Event): Promise<void> {
    event.stopPropagation();

    const states = new Map(this.downloadStates());
    states.set(sessionId, "loading");
    this.downloadStates.set(states);

    try {
      const assets = await this.sessionRuntime.getSessionAssets(sessionId);
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

  public async exportStaticBoard(sessionId: string, sessionCode: string, event: Event): Promise<void> {
    event.stopPropagation();
    this.setExportState(sessionId, "loading");

    try {
      const [state, sessionAssets] = await Promise.all([
        this.sessionRuntime.getSessionState(sessionId),
        this.sessionRuntime.getSessionAssets(sessionId),
      ]);
      const content = await buildStaticBoardExportZip({state, sessionCode, sessionAssets});
      this.downloadBlob(content, `stickermania-board-${sessionCode}.zip`);
      this.setExportState(sessionId, "done");
    } catch {
      this.setExportState(sessionId, "error");
    }
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

  public isSessionLeaving(sessionId: string): boolean {
    return this.leavingSessionIds().has(sessionId);
  }

  private async loadSessions(): Promise<void> {
    this.isLoadingSessions.set(true);
    try {
      this.sessions.set(await this.sessionRuntime.listSessions());
    } catch { /* ignore */ }
    this.isLoadingSessions.set(false);
  }

  private startSessionLeave(sessionId: string): void {
    const leaving = new Set(this.leavingSessionIds());
    leaving.add(sessionId);
    this.leavingSessionIds.set(leaving);

    setTimeout(() => {
      this.sessions.set(this.sessions().filter((s) => s.sessionId !== sessionId));

      const nextLeaving = new Set(this.leavingSessionIds());
      nextLeaving.delete(sessionId);
      this.leavingSessionIds.set(nextLeaving);

      const nextDownloadStates = new Map(this.downloadStates());
      nextDownloadStates.delete(sessionId);
      this.downloadStates.set(nextDownloadStates);

      const nextExportStates = new Map(this.exportStates());
      nextExportStates.delete(sessionId);
      this.exportStates.set(nextExportStates);

    }, this.sessionLeaveDurationMs);
  }

  private setExportState(sessionId: string, state: "idle" | "loading" | "done" | "error"): void {
    const states = new Map(this.exportStates());
    states.set(sessionId, state);
    this.exportStates.set(states);
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

}
