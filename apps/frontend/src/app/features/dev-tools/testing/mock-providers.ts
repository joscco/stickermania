import {computed, Injectable, signal} from '@angular/core';
import {type BoardStickerPlacement, type PlayerSticker, type SessionState, type StickerCollageGameState} from '@birthday/shared';
import {makeSessionState} from './mock-data';
import {WorldStore} from '../../../core/state/world.store';
import {GameSessionStore} from '../../../core/state/session-state.store';
import {WebSocketService} from '../../../core/realtime/websocket.service';
import {RealtimeRuntimeService} from '../../../core/runtime/realtime-runtime.service';
import {StickerPlayerService} from '../../player/player-shell/services/sticker-player.service';

@Injectable({providedIn: 'root'})
export class MockWorldStore {
  readonly sessionState = signal<SessionState | null>(makeSessionState());
  readonly lastError = signal<string | null>(null);
  readonly players = computed(() => this.sessionState()?.players ?? {});
  readonly stickerCollageGameState = computed(() => this.sessionState()?.gameState ?? null);

  setSessionState(state: SessionState) { this.sessionState.set(state); this.lastError.set(null); }
  clearSessionState() { this.sessionState.set(null); }
  addCreatedStickerLocal(sticker: PlayerSticker) {
    this.sessionState.update((state) => {
      if (!state) return state;
      const gameState = state.gameState as StickerCollageGameState;
      const existing = gameState.playerStickers[sticker.ownerPlayerId] ?? [];
      return {
        ...state,
        gameState: {
          ...gameState,
          playerStickers: {
            ...gameState.playerStickers,
            [sticker.ownerPlayerId]: [...existing.filter(item => item.id !== sticker.id), sticker],
          },
        },
      };
    });
  }
}

@Injectable({providedIn: 'root'})
export class MockGameSessionStore {
  readonly sessionId = signal('mock-session');
  readonly playerId = signal('player-1');
  readonly clientId = signal('mock-client');
  readonly playerName = signal('Anna');
  readonly currentMode = signal<'LOBBY' | 'STICKER_COLLAGE' | 'IDLE'>('STICKER_COLLAGE');
  readonly feedback = signal<{text: string; type: 'success' | 'error'} | null>(null);
  setSession(id: string) { this.sessionId.set(id); }
  setJoined(args: {sessionId: string; playerId: string; clientId: string}) {
    this.sessionId.set(args.sessionId);
    this.playerId.set(args.playerId);
    this.clientId.set(args.clientId);
  }
  clearTask(nextMode: 'LOBBY' | 'STICKER_COLLAGE' | 'IDLE' = 'IDLE') { this.currentMode.set(nextMode); }
  showFeedback(text: string, type: 'success' | 'error') { this.feedback.set({text, type}); }
}

@Injectable({providedIn: 'root'})
export class MockWebSocketService {
  readonly status = signal<'idle' | 'connecting' | 'connected' | 'disconnected'>('connected');
  readonly wasConnected = signal(true);
  readonly externalPickerActive = signal(false);
  send(_msg: unknown) {}
  connect() { this.status.set('connected'); }
  disconnect() { this.status.set('disconnected'); }
  onMessage(_listener: (msg: unknown) => void): () => void { return () => {}; }
  updatePendingJoin(_msg: unknown) {}
  setExternalPickerActive(active: boolean) { this.externalPickerActive.set(active); }
}

@Injectable({providedIn: 'root'})
export class MockRealtimeRuntimeService extends MockWebSocketService {}

@Injectable({providedIn: 'root'})
export class MockStickerPlayerService {
  readonly gameState = computed<StickerCollageGameState | null>(() => makeSessionState().gameState);
  readonly allCreatedStickers = computed<PlayerSticker[]>(() => Object.values(this.gameState()?.playerStickers ?? {}).flat());
  readonly boardPlacements = computed<BoardStickerPlacement[]>(() => this.gameState()?.boardPlacements ?? []);
  upsertBoardPlacements(_placements: BoardStickerPlacement[]) {}
  deleteBoardPlacements(_instanceIds: string[]) {}
}

export function provideMockState() {
  const worldStore = new MockWorldStore();
  const sessionStore = new MockGameSessionStore();

  return {
    worldStore,
    sessionStore,
    providers: [
      {provide: WorldStore, useValue: worldStore},
      {provide: GameSessionStore, useValue: sessionStore},
      {provide: WebSocketService, useClass: MockWebSocketService},
      {provide: RealtimeRuntimeService, useClass: MockRealtimeRuntimeService},
      {provide: StickerPlayerService, useClass: MockStickerPlayerService},
    ],
  };
}
