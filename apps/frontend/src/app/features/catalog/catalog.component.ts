import {Component, signal, computed, inject, OnInit} from '@angular/core';
import {CommonModule} from '@angular/common';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import type {MinigameTask} from '@birthday/shared';
import {PlayerScreen} from '../game/player/player-screen.enum';
import {
  MockWorldStore,
  MockGameSessionStore,
  MockWebSocketService,
  MockStickerPlayerService,
  type MockPhase,
  makeMockSessionState,
} from '../../testing/mock-providers';
import {WorldStore} from '../../core/world.store';
import {GameSessionStore} from '../../core/challenge.store';
import {WebSocketService} from '../../core/websocket.service';
import {StickerPlayerService} from '../game/services/sticker-player.service';
import {PlayerComponent} from '../game/player/player.component';
import {BoardComponent} from '../game/board/board.component';
import {LandingComponent} from '../game/landing/landing.component';
import {OfflineComponent} from '../game/offline/offline.component';
import {BoardLobbyComponent} from '../game/board/board-lobby.component';

type ViewMode = 'player' | 'board' | 'landing' | 'offline';

type ScreenKey =
  | 'landing'
  | 'offline'
  | 'connecting'
  | 'disconnected'
  | 'reconnecting'
  | 'lobby-name'
  | 'lobby-avatar'
  | 'lobby-waiting'
  | 'building'
  | 'building-submitted'
  | 'building-skipped'
  | 'voting'
  | 'voting-done'
  | 'results'
  | 'board-lobby'
  | 'board-lobby-scene'
  | 'board-building'
  | 'board-voting'
  | 'board-results';

@Component({
  selector: 'app-catalog',
  standalone: true,
  imports: [
    CommonModule,
    PlayerComponent,
    BoardComponent,
    LandingComponent,
    OfflineComponent,
    BoardLobbyComponent,
  ],
  providers: [
    {provide: WorldStore, useClass: MockWorldStore},
    {provide: GameSessionStore, useClass: MockGameSessionStore},
    {provide: WebSocketService, useClass: MockWebSocketService},
    {provide: StickerPlayerService, useClass: MockStickerPlayerService},
  ],
  templateUrl: './catalog.component.html',
  host: {class: 'h-dvh text-neutral-900 flex flex-col'},
})
export class CatalogComponent implements OnInit {
  private readonly http = inject(HttpClient);
  public readonly mockWorldStore = inject(WorldStore) as unknown as MockWorldStore;

  public readonly currentScreen = signal<ScreenKey>('lobby-waiting');
  public readonly showVmPanel = signal(false);
  public readonly isEditingVm = signal(false);
  public readonly vmEditJson = signal('');
  public readonly editError = signal<string | null>(null);

  // ── Task loading ────────────────────────────────────────────
  public readonly tasks = signal<MinigameTask[]>([]);
  public readonly selectedTaskId = signal<string>('');

  async ngOnInit() {
    try {
      const data = await firstValueFrom(this.http.get<Array<MinigameTask & {_index?: number}>>("/api/game-config/tasks"));
      this.tasks.set(data);
    } catch { /* offline */ }
  }

  // ── Computed ────────────────────────────────────────────────
  public readonly currentMode = computed<ViewMode>(() => {
    const screen = this.currentScreen();
    if (screen === 'landing') return 'landing';
    if (screen === 'offline') return 'offline';
    if (screen.startsWith('board-')) return 'board';
    return 'player';
  });

  public readonly playerScreen = computed<PlayerScreen | null>(() => {
    const screen = this.currentScreen();
    if (screen === 'landing' || screen === 'offline') return null;
    if (screen.startsWith('board-')) return null;
    if (screen === 'building') return PlayerScreen.BUILDING;
    return screen as PlayerScreen;
  });

  public readonly showTaskSelector = computed(() =>
    this.currentScreen() === 'building' ||
    this.currentScreen() === 'voting' ||
    this.currentScreen() === 'voting-done' ||
    this.currentScreen() === 'results'
  );

  public readonly boardPhase = computed<string | null>(() => {
    const screen = this.currentScreen();
    switch (screen) {
      case 'board-lobby': return 'LOBBY';
      case 'board-lobby-scene': return 'LOBBY';
      case 'board-building': return 'BUILDING';
      case 'board-voting': return 'VOTING';
      case 'board-results': return 'RESULTS';
      default: return null;
    }
  });

  public readonly sessionsStateJson = computed(() => {
    const state = this.mockWorldStore.sessionState();
    if (!state) return '';
    return JSON.stringify(state.gameState, null, 2);
  });

  public readonly screens: {key: ScreenKey; label: string; group: string}[] = [
    {key: 'landing', label: 'Landing / Code Entry', group: 'App'},
    {key: 'offline', label: 'Offline', group: 'App'},
    {key: 'connecting', label: 'Connecting', group: 'Player'},
    {key: 'disconnected', label: 'Disconnected', group: 'Player'},
    {key: 'reconnecting', label: 'Reconnecting', group: 'Player'},
    {key: 'lobby-name', label: 'Lobby: Name', group: 'Player'},
    {key: 'lobby-avatar', label: 'Lobby: Avatar', group: 'Player'},
    {key: 'lobby-waiting', label: 'Lobby Waiting', group: 'Player'},
    {key: 'building', label: 'Building (Minigame)', group: 'Player'},
    {key: 'building-submitted', label: 'Building (submitted)', group: 'Player'},
    {key: 'building-skipped', label: 'Building (skipped)', group: 'Player'},
    {key: 'voting', label: 'Voting', group: 'Player'},
    {key: 'voting-done', label: 'Voting (done)', group: 'Player'},
    {key: 'results', label: 'Results', group: 'Player'},
    {key: 'board-lobby', label: 'Board Lobby (session list)', group: 'Board'},
    {key: 'board-lobby-scene', label: 'Board Lobby (game)', group: 'Board'},
    {key: 'board-building', label: 'Building', group: 'Board'},
    {key: 'board-voting', label: 'Voting', group: 'Board'},
    {key: 'board-results', label: 'Results', group: 'Board'},
  ];

  // ── Screen change ───────────────────────────────────────────
  public onScreenChange(event: Event): void {
    const screen = (event.target as HTMLSelectElement).value as ScreenKey;
    this.currentScreen.set(screen);
    this.selectedTaskId.set('');
    this.applyBuildingState();
  }

  public onTaskSelect(taskId: string): void {
    this.selectedTaskId.set(taskId);
    this.applyBuildingState();
  }

  private applyBuildingState(): void {
    const screen = this.currentScreen();
    const phaseMap: Record<string, MockPhase> = {
      'connecting': 'lobby',
      'disconnected': 'lobby',
      'reconnecting': 'lobby',
      'lobby-name': 'lobby',
      'lobby-avatar': 'lobby',
      'lobby-waiting': 'lobby',
      'landing': 'lobby',
      'offline': 'lobby',
      'building': 'building',
      'building-submitted': 'building-submitted',
      'building-skipped': 'building-skipped',
      'voting': 'voting',
      'voting-done': 'voting-done',
      'results': 'results',
      'board-lobby': 'lobby',
      'board-lobby-scene': 'lobby',
      'board-building': 'building',
      'board-voting': 'voting',
      'board-results': 'results',
    };
    const phase = phaseMap[screen] ?? 'lobby';

    // If a task is selected, pass it for building, voting, and results screens
    const taskId = this.selectedTaskId();
    const minigameScreens = ['building', 'voting', 'voting-done', 'results'];
    const customTask = (minigameScreens.includes(screen) && taskId)
      ? this.tasks().find(t => t.id === taskId)
      : undefined;

    const sessionState = makeMockSessionState(phase, undefined, customTask);
    this.mockWorldStore.setSessionState(sessionState);
  }

  // ── VM state editing ────────────────────────────────────────
  public toggleVmPanel(): void {
    this.showVmPanel.update(v => !v);
  }

  public startEditVm(): void {
    this.vmEditJson.set(this.sessionsStateJson());
    this.isEditingVm.set(true);
    this.editError.set(null);
  }

  public cancelEditVm(): void {
    this.isEditingVm.set(false);
    this.editError.set(null);
  }

  public applyVmEdit(): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(this.vmEditJson());
    } catch {
      this.editError.set('Invalid JSON');
      return;
    }

    const currentState = this.mockWorldStore.sessionState();
    if (!currentState) return;

    this.mockWorldStore.setSessionState({
      ...currentState,
      gameState: parsed as typeof currentState.gameState,
    });
    this.isEditingVm.set(false);
    this.editError.set(null);
  }

  public onVmEditInput(event: Event): void {
    this.vmEditJson.set((event.target as HTMLTextAreaElement).value);
  }
}
