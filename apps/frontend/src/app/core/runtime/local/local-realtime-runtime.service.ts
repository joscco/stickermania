import {Injectable, signal} from "@angular/core";
import type {
  BoardStickerPlacement,
  ClientToServerMessage,
  ServerToClientMessage,
  SessionPlayer,
  SessionState,
} from "@birthday/shared";
import {
  createSessionPlayer,
  ensurePlayerDefaultStickerPack,
  normalizeBoardZIndexes,
  touchSessionState,
} from "@birthday/shared/sessionState";
import type {WsConnectionStatus} from "../../realtime/websocket.service";
import {LocalSessionRuntimeService} from "./local-session-runtime.service";

@Injectable({providedIn: "root"})
export class LocalRealtimeRuntimeService {
  public readonly status = signal<WsConnectionStatus>("idle");
  public readonly wasConnected = signal(false);
  public readonly externalPickerActive = signal(false);

  private readonly messageListeners: Array<(msg: ServerToClientMessage) => void> = [];
  private connectedClientId: string | null = null;
  private connectedSessionId: string | null = null;
  private connectedPlayerId: string | null = null;
  private connectedKind: "player" | "board" | null = null;
  private pendingJoinMsg: ClientToServerMessage | null = null;

  public constructor(private readonly sessions: LocalSessionRuntimeService) {}

  public connect(): void {
    this.connectedClientId = this.createId("local-client");
    this.status.set("connected");
    this.wasConnected.set(true);
    if (this.pendingJoinMsg) {
      void this.send(this.pendingJoinMsg);
    }
  }

  public disconnect(): void {
    this.connectedClientId = null;
    this.connectedSessionId = null;
    this.connectedPlayerId = null;
    this.connectedKind = null;
    this.pendingJoinMsg = null;
    this.status.set("disconnected");
  }

  public send(msg: ClientToServerMessage): void {
    if (msg.type === "join") {
      this.pendingJoinMsg = msg;
    }
    void this.handleMessage(msg);
  }

  public updatePendingJoin(msg: ClientToServerMessage): void {
    if (msg.type === "join") {
      this.pendingJoinMsg = msg;
    }
  }

  public setExternalPickerActive(active: boolean): void {
    this.externalPickerActive.set(active);
  }

  public onMessage(listener: (msg: ServerToClientMessage) => void): () => void {
    this.messageListeners.push(listener);
    return () => {
      const index = this.messageListeners.indexOf(listener);
      if (index >= 0) {
        this.messageListeners.splice(index, 1);
      }
    };
  }

  private async handleMessage(msg: ClientToServerMessage): Promise<void> {
    if (this.status() !== "connected" && msg.type !== "join") {
      return;
    }

    switch (msg.type) {
      case "join":
        await this.handleJoin(msg);
        break;
      case "submit-user-data":
        await this.mutateConnectedSession(async (state, player) => {
          void msg;
          player.name = "Spieler";
          ensurePlayerDefaultStickerPack(state.gameState, player.id, player.name);
          await this.sessions.deleteAssetRef(player.avatarUrl);
          player.avatarUrl = null;
          player.avatarAssetPath = null;
        });
        break;
      case "game-action":
        await this.handleGameAction(msg);
        break;
      case "start-game-session":
      case "reset-session":
        await this.emitCurrentState();
        break;
      case "ping":
        this.emit({type: "pong", t: msg.t, serverTime: Date.now()});
        break;
    }
  }

  private async handleJoin(msg: Extract<ClientToServerMessage, {type: "join"}>): Promise<void> {
    const state = await this.sessions.loadPersistedSessionState(msg.sessionId);
    const now = Date.now();
    const clientId = this.connectedClientId ?? this.createId("local-client");
    this.connectedClientId = clientId;
    this.connectedSessionId = state.sessionId;
    this.connectedKind = msg.kind;

    let player: SessionPlayer | undefined;
    if (msg.kind === "board") {
      player = {
        id: "__board__",
        name: "Board",
        avatarUrl: null,
        avatarAssetPath: null,
        score: 0,
        joinedAt: now,
        connected: true,
        isHost: false,
        teamId: null,
      };
      this.connectedPlayerId = player.id;
    } else {
      player = msg.playerId ? state.players[msg.playerId] : Object.values(state.players)[0];
      if (!player) {
        const playerId = this.createId("local-player");
        player = createSessionPlayer({
          playerId,
          now,
          isHost: Object.keys(state.players).length === 0,
        });
        state.players[player.id] = player;
      }
      if (player.avatarUrl) {
        await this.sessions.deleteAssetRef(player.avatarUrl);
      }
      player.name = "Spieler";
      player.avatarUrl = null;
      player.avatarAssetPath = null;
      player.connected = true;
      state.gameState.playerStickers[player.id] ??= [];
      ensurePlayerDefaultStickerPack(state.gameState, player.id, player.name);
      touchSessionState(state, now);
      await this.sessions.savePersistedSessionState(state);
      this.connectedPlayerId = player.id;
    }

    this.emit({
      type: "welcome",
      clientId,
      playerId: player.id,
      sessionId: state.sessionId,
      serverTime: now,
      serverSessionId: "local-web",
    });
    this.emit({type: "session-state", state: await this.sessions.getSessionState(state.sessionId)});
  }

  private async handleGameAction(msg: Extract<ClientToServerMessage, {type: "game-action"}>): Promise<void> {
    await this.mutateConnectedSession((state, player) => {
      switch (msg.action.type) {
        case "upsert-board-placements": {
          const knownStickerIds = new Set(state.gameState.stickerCatalog.map(sticker => sticker.id));
          const incoming = msg.action.placements
            .filter(placement => knownStickerIds.has(placement.stickerId))
            .filter(placement => this.connectedKind === "board" || (placement.placedByPlayerId ?? placement.ownerPlayerId) === player.id)
            .map(placement => ({
              ...placement,
              ownerPlayerId: placement.ownerPlayerId ?? placement.placedByPlayerId ?? player.id,
              placedByPlayerId: placement.placedByPlayerId ?? placement.ownerPlayerId ?? player.id,
              updatedAt: Date.now(),
              groupId: undefined,
            }));
          const merged = new Map(state.gameState.boardPlacements.map(placement => [placement.instanceId, placement]));
          for (const placement of incoming) {
            merged.set(placement.instanceId, placement as BoardStickerPlacement);
          }
          state.gameState.boardPlacements = normalizeBoardZIndexes([...merged.values()]);
          break;
        }
        case "delete-board-placements": {
          const deleteIds = new Set(msg.action.instanceIds);
          state.gameState.boardPlacements = normalizeBoardZIndexes(state.gameState.boardPlacements.filter(placement => {
            if (!deleteIds.has(placement.instanceId)) return true;
            return this.connectedKind !== "board" && (placement.placedByPlayerId ?? placement.ownerPlayerId) !== player.id;
          }));
          break;
        }
      }
    });
  }

  private async mutateConnectedSession(mutator: (state: SessionState, player: SessionPlayer) => void | Promise<void>): Promise<void> {
    const sessionId = this.connectedSessionId;
    const playerId = this.connectedPlayerId;
    if (!sessionId || !playerId) {
      return;
    }
    const state = await this.sessions.loadPersistedSessionState(sessionId);
    const player = playerId === "__board__"
      ? {id: "__board__", name: "Board"} as SessionPlayer
      : state.players[playerId];
    if (!player) {
      return;
    }
    await mutator(state, player);
    touchSessionState(state);
    await this.sessions.savePersistedSessionState(state);
    this.emit({type: "session-state", state: await this.sessions.getSessionState(sessionId)});
  }

  private async emitCurrentState(): Promise<void> {
    if (!this.connectedSessionId) {
      return;
    }
    const state = await this.sessions.getSessionState(this.connectedSessionId);
    this.emit({type: "session-state", state});
  }

  private emit(msg: ServerToClientMessage): void {
    for (const listener of this.messageListeners) {
      listener(msg);
    }
  }

  private createId(prefix: string): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }
}
