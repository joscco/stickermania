import {STICKERMANIA_CONFIG} from "@stickermania/shared/stickermaniaConfig";

export const environment = {
  production: false,
  appMode: "lan-host" as "cloud" | "lan-host" | "local-web" | "dev",
  websocketUrl: `ws://localhost:${STICKERMANIA_CONFIG.runtime.defaultPort}/ws`
};
