import {inject, Injectable, computed} from '@angular/core';
import {PlayerScreen} from './player-screen.enum';
import {GameSessionStore} from '../../../core/state/session-state.store';
import {WorldStore} from '../../../core/state/world.store';
import {ReconnectService} from '../../../core/realtime/reconnect.service';
import {RealtimeRuntimeService} from '../../../core/runtime/realtime-runtime.service';
import {SessionRuntimeService} from '../../../core/runtime/session-runtime.service';

@Injectable()
export class PlayerScreenDataService {
    private readonly sessionStore = inject(GameSessionStore);
    private readonly worldStore = inject(WorldStore);
    private readonly realtime = inject(RealtimeRuntimeService);
    private readonly reconnectService = inject(ReconnectService);
    private readonly sessionRuntime = inject(SessionRuntimeService);

    public readonly existingPlayerName = computed(() => {
        const id = this.sessionStore.playerId();
        const serverName = id ? this.worldStore.players()[id]?.name.trim() : "";
        return serverName || this.sessionStore.playerName().trim() || this.reconnectService.loadDeviceName() || "";
    });

    public readonly isNameSet = computed(() => this.existingPlayerName().trim().length > 0);

    public readonly hasAvatar = computed(() => {
        const id = this.sessionStore.playerId();
        return id ? !!this.worldStore.players()[id]?.avatarUrl : false;
    });

    public readonly needsProfile = computed(() => this.sessionRuntime.supportsPlayerProfiles() && (!this.isNameSet() || !this.hasAvatar()));

    public readonly existingAvatarImage = computed(() => {
        const id = this.sessionStore.playerId();
        return id ? (this.worldStore.players()[id]?.avatarUrl ?? null) : null;
    });

    public readonly baseScreen = computed<PlayerScreen>(() => {
        const wsStatus = this.realtime.status();
        if (wsStatus === 'idle' || wsStatus === 'connecting') {
            if (wsStatus === 'connecting' && this.realtime.wasConnected() && this.realtime.externalPickerActive()) {
                return this.readyPlayerScreen();
            }
            return this.realtime.wasConnected() ? PlayerScreen.RECONNECTING : PlayerScreen.CONNECTING;
        }
        if (wsStatus === 'disconnected') return PlayerScreen.DISCONNECTED;
        return this.readyPlayerScreen();
    });

    public readonly players = computed(() => this.worldStore.players());

    private readyPlayerScreen(): PlayerScreen {
        if (!this.isReady()) return PlayerScreen.CONNECTING;
        return PlayerScreen.STICKER_SPACE;
    }

    private readonly isReady = computed(() => {
        const state = this.worldStore.sessionState();
        if (!state) return false;
        const playerId = this.sessionStore.playerId();
        if (!playerId) return false;
        return !!state.players[playerId];
    });
}
