import {computed, Injectable} from "@angular/core";
import {environment} from "../../../environments/environment";

export type DeliveryMode = "cloud" | "lan-host" | "local-web" | "dev";
export type EnvironmentAppMode = DeliveryMode | "party";
export type RuntimeBackend = "remote" | "browser";
export type RuntimeSessionModel = "cloud-sessions" | "host-game" | "local-game";

export interface RuntimeFeatureProfile {
  backend: RuntimeBackend;
  sessionModel: RuntimeSessionModel;
  boardAuthRequired: boolean;
  boardScreenEnabled: boolean;
  playerProfilesEnabled: boolean;
  playerQrEnabled: boolean;
  sessionCodeVisible: boolean;
  localBackupEnabled: boolean;
}

const RUNTIME_FEATURES: Record<DeliveryMode, RuntimeFeatureProfile> = {
  cloud: {
    backend: "remote",
    sessionModel: "cloud-sessions",
    boardAuthRequired: true,
    boardScreenEnabled: true,
    playerProfilesEnabled: true,
    playerQrEnabled: true,
    sessionCodeVisible: true,
    localBackupEnabled: false,
  },
  "lan-host": {
    backend: "remote",
    sessionModel: "host-game",
    boardAuthRequired: false,
    boardScreenEnabled: true,
    playerProfilesEnabled: true,
    playerQrEnabled: true,
    sessionCodeVisible: false,
    localBackupEnabled: false,
  },
  "local-web": {
    backend: "browser",
    sessionModel: "local-game",
    boardAuthRequired: false,
    boardScreenEnabled: false,
    playerProfilesEnabled: false,
    playerQrEnabled: false,
    sessionCodeVisible: false,
    localBackupEnabled: true,
  },
  dev: {
    backend: "remote",
    sessionModel: "cloud-sessions",
    boardAuthRequired: false,
    boardScreenEnabled: true,
    playerProfilesEnabled: true,
    playerQrEnabled: true,
    sessionCodeVisible: true,
    localBackupEnabled: false,
  },
};

@Injectable({providedIn: "root"})
export class AppRuntimeService {
  public readonly mode = resolveDeliveryMode(environment.appMode as EnvironmentAppMode);
  public readonly features = RUNTIME_FEATURES[this.mode];
  public readonly isCloud = computed(() => this.mode === "cloud");
  public readonly isLanHost = computed(() => this.mode === "lan-host");
  public readonly isLocalWeb = computed(() => this.mode === "local-web");
  public readonly isRemoteBackend = computed(() => this.features.backend === "remote");

  public usesCloudSessions(): boolean {
    return this.features.sessionModel === "cloud-sessions";
  }

  public usesHostGame(): boolean {
    return this.features.sessionModel === "host-game";
  }

  public usesLocalBrowserGame(): boolean {
    return this.features.sessionModel === "local-game";
  }

  public requiresBoardAuth(): boolean {
    return this.features.boardAuthRequired;
  }

  public supportsBoardScreen(): boolean {
    return this.features.boardScreenEnabled;
  }

  public supportsPlayerProfiles(): boolean {
    return this.features.playerProfilesEnabled;
  }

  public supportsPlayerQr(): boolean {
    return this.features.playerQrEnabled;
  }

  public showsSessionCode(): boolean {
    return this.features.sessionCodeVisible;
  }

  public supportsLocalBackup(): boolean {
    return this.features.localBackupEnabled;
  }
}

export function resolveDeliveryMode(mode: EnvironmentAppMode): DeliveryMode {
  if (mode === "party") {
    return "lan-host";
  }
  return mode;
}
