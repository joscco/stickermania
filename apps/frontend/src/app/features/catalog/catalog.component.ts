import {Component, signal, computed, inject} from '@angular/core';
import {CommonModule} from '@angular/common';
import type {SessionPlayer} from '@birthday/shared';
import {
  MockWorldStore,
  MockGameSessionStore,
  MockWebSocketService,
  MockStickerPlayerService,
  type MockPhase,
  provideMockState,
} from '../../testing/mock-providers';
import {WorldStore} from '../../core/world.store';
import {GameSessionStore} from '../../core/challenge.store';
import {WebSocketService} from '../../core/websocket.service';
import {StickerPlayerService} from '../../features/game/services/sticker-player.service';
import {PlayerConnectingComponent} from '../game/player/scenes/connecting/player-connecting.component';
import {PlayerDisconnectedComponent} from '../game/player/scenes/disconnected/player-disconnected.component';
import {PlayerReconnectingComponent} from '../game/player/scenes/reconnecting/player-reconnecting.component';
import {PlayerLobbyWaitingComponent} from '../game/player/scenes/lobby-waiting/player-lobby-waiting.component';
import {PlayerBuildingComponent} from '../game/player/scenes/building/player-building.component';
import {PlayerBuildingSubmittedComponent} from '../game/player/scenes/building-submitted/player-building-submitted.component';
import {PlayerBuildingSkippedComponent} from '../game/player/scenes/building-skipped/player-building-skipped.component';
import {PlayerVotingComponent} from '../game/player/scenes/voting/player-voting.component';
import {PlayerResultsComponent} from '../game/player/scenes/results/player-results.component';
import {PlayerNextRoundComponent} from '../game/player/scenes/next-round/player-next-round.component';
import {BoardLobbySceneComponent} from '../game/board/scenes/lobby/board-lobby-scene.component';
import {BoardBuildingSceneComponent} from '../game/board/scenes/building/board-building-scene.component';
import {BoardVotingSceneComponent} from '../game/board/scenes/voting/board-voting-scene.component';
import {BoardResultsSceneComponent} from '../game/board/scenes/results/board-results-scene.component';

type ViewMode = 'player' | 'board';

type ScreenKey =
  | 'connecting'
  | 'disconnected'
  | 'reconnecting'
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
    PlayerConnectingComponent,
    PlayerDisconnectedComponent,
    PlayerReconnectingComponent,
    PlayerLobbyWaitingComponent,
    PlayerBuildingComponent,
    PlayerBuildingSubmittedComponent,
    PlayerBuildingSkippedComponent,
    PlayerVotingComponent,
    PlayerResultsComponent,
    PlayerNextRoundComponent,
    BoardLobbySceneComponent,
    BoardBuildingSceneComponent,
    BoardVotingSceneComponent,
    BoardResultsSceneComponent,
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
  public readonly currentMode = signal<ViewMode>('player');
  public readonly gameState = computed(() => this.mockWorldStore.stickerCollageGameState());

  public readonly mockWorldStore = inject(WorldStore) as unknown as MockWorldStore;
  public readonly mockSessionStore = inject(GameSessionStore) as unknown as MockGameSessionStore;
  public readonly mockStickerService = inject(StickerPlayerService) as unknown as MockStickerPlayerService;

  public readonly screens: {key: ScreenKey; label: string; mode: ViewMode}[] = [
    {key: 'connecting', label: 'Connecting', mode: 'player'},
    {key: 'disconnected', label: 'Disconnected', mode: 'player'},
    {key: 'reconnecting', label: 'Reconnecting', mode: 'player'},
    {key: 'lobby-waiting', label: 'Lobby Waiting', mode: 'player'},
    {key: 'building', label: 'Building', mode: 'player'},
    {key: 'building-submitted', label: 'Building (submitted)', mode: 'player'},
    {key: 'building-skipped', label: 'Building (skipped)', mode: 'player'},
    {key: 'voting', label: 'Voting', mode: 'player'},
    {key: 'voting-done', label: 'Voting (done)', mode: 'player'},
    {key: 'voting-all-done', label: 'Voting (all done)', mode: 'player'},
    {key: 'results', label: 'Results', mode: 'player'},
    {key: 'next-round', label: 'Next Round', mode: 'player'},
    {key: 'board-lobby', label: 'Board: Lobby', mode: 'board'},
    {key: 'board-building', label: 'Board: Building', mode: 'board'},
    {key: 'board-voting', label: 'Board: Voting', mode: 'board'},
    {key: 'board-results', label: 'Board: Results', mode: 'board'},
  ];

  public onScreenChange(event: Event): void {
    const screen = (event.target as HTMLSelectElement).value as ScreenKey;
    this.currentScreen.set(screen);
    const entry = this.screens.find(s => s.key === screen);
    this.currentMode.set(entry?.mode ?? 'player');
    const phase = this.phaseForScreen(screen);
    const overrides = provideMockState(phase);
    this.mockWorldStore.setSessionState(overrides.worldStore.sessionState()!);
  }

  private phaseForScreen(screen: ScreenKey): MockPhase {
    const map: Record<ScreenKey, MockPhase> = {
      'connecting': 'lobby',
      'disconnected': 'lobby',
      'reconnecting': 'lobby',
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

  // No-op event handlers for catalog previews
  public readonly noop = () => {};
  public readonly noopStr = (_s: string) => {};

  public readonly connectedPlayers = computed<SessionPlayer[]>(() =>
    Object.values(this.mockWorldStore.players()).filter(p => p.connected)
  );
}