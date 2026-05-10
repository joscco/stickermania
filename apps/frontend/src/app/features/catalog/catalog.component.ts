import {Component, signal, computed, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {SessionPlayer} from '@birthday/shared';
import {PlayerScreen} from '../game/player/player-screen.enum';
import {
  MockWorldStore,
  MockGameSessionStore,
  MockWebSocketService,
  MockStickerPlayerService,
  type MockPhase,
  provideMockState,
  getMockVotingVm,
  getMockResultsVm,
} from '../../testing/mock-providers';
import {WorldStore} from '../../core/world.store';
import {GameSessionStore} from '../../core/challenge.store';
import {WebSocketService} from '../../core/websocket.service';
import {StickerPlayerService} from '../game/services/sticker-player.service';
import {PlayerComponent} from '../game/player/player.component';
import {BoardComponent} from '../game/board/board.component';

type ViewMode = 'player' | 'board';

type ScreenKey =
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
  | 'voting-all-done'
  | 'results'
  | 'next-round'
  | 'board-lobby'
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
  ],
  providers: [
    {provide: WorldStore, useClass: MockWorldStore},
    {provide: GameSessionStore, useClass: MockGameSessionStore},
    {provide: WebSocketService, useClass: MockWebSocketService},
    {provide: StickerPlayerService, useClass: MockStickerPlayerService},
  ],
  templateUrl: './catalog.component.html',
  host: {class: 'h-dvh overflow-hidden bg-stone-100 text-stone-900 flex flex-col'},
})
export class CatalogComponent {
  public readonly currentScreen = signal<ScreenKey>('lobby-waiting');
  public readonly showVmPanel = signal(false);
  public readonly isEditingVm = signal(false);
  public readonly vmEditJson = signal('');
  public readonly editError = signal<string | null>(null);

  public readonly mockWorldStore = inject(WorldStore) as unknown as MockWorldStore;

  public readonly currentMode = computed<ViewMode>(() =>
    this.currentScreen().startsWith('board-') ? 'board' : 'player'
  );

  public readonly playerScreen = computed<PlayerScreen | null>(() => {
    const screen = this.currentScreen();
    if (screen.startsWith('board-')) return null;
    return screen as PlayerScreen;
  });

  public readonly boardPhase = computed<string | null>(() => {
    const screen = this.currentScreen();
    switch (screen) {
      case 'board-lobby': return 'LOBBY';
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
    {key: 'connecting', label: 'Connecting', group: 'Player'},
    {key: 'disconnected', label: 'Disconnected', group: 'Player'},
    {key: 'reconnecting', label: 'Reconnecting', group: 'Player'},
    {key: 'lobby-name', label: 'Lobby: Name', group: 'Player'},
    {key: 'lobby-avatar', label: 'Lobby: Avatar', group: 'Player'},
    {key: 'lobby-waiting', label: 'Lobby Waiting', group: 'Player'},
    {key: 'building', label: 'Building', group: 'Player'},
    {key: 'building-submitted', label: 'Building (submitted)', group: 'Player'},
    {key: 'building-skipped', label: 'Building (skipped)', group: 'Player'},
    {key: 'voting', label: 'Voting', group: 'Player'},
    {key: 'voting-done', label: 'Voting (done)', group: 'Player'},
    {key: 'voting-all-done', label: 'Voting (all done)', group: 'Player'},
    {key: 'results', label: 'Results', group: 'Player'},
    {key: 'next-round', label: 'Next Round', group: 'Player'},
    {key: 'board-lobby', label: 'Lobby', group: 'Board'},
    {key: 'board-building', label: 'Building', group: 'Board'},
    {key: 'board-voting', label: 'Voting', group: 'Board'},
    {key: 'board-results', label: 'Results', group: 'Board'},
  ];

  public onScreenChange(event: Event): void {
    const screen = (event.target as HTMLSelectElement).value as ScreenKey;
    this.currentScreen.set(screen);
    const phase = this.phaseForScreen(screen);
    const overrides = provideMockState(phase);
    this.mockWorldStore.setSessionState(overrides.worldStore.sessionState()!);
    if (screen.startsWith('board-')) {
      this.mockWorldStore.sessionState.update(s => s ? {...s, gameState: {...s.gameState}} : s);
    }
    this.isEditingVm.set(false);
    this.editError.set(null);
  }

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

  private phaseForScreen(screen: ScreenKey): MockPhase {
    const map: Record<ScreenKey, MockPhase> = {
      'connecting': 'lobby',
      'disconnected': 'lobby',
      'reconnecting': 'lobby',
      'lobby-name': 'lobby',
      'lobby-avatar': 'lobby',
      'lobby-waiting': 'lobby',
      'building': 'building',
      'building-submitted': 'building-submitted',
      'building-skipped': 'building-skipped',
      'voting': 'voting',
      'voting-done': 'voting-done',
      'voting-all-done': 'voting-all-done',
      'results': 'results',
      'next-round': 'next-round',
      'board-lobby': 'lobby',
      'board-building': 'building',
      'board-voting': 'voting',
      'board-results': 'results',
    };
    return map[screen];
  }
}
