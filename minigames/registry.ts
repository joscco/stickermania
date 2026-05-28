import type {MinigameHandler} from "@birthday/shared";
import {TimerStopHandler} from "./timer-stop/server-handler.js";

const handlers = new Map<string, MinigameHandler>([
  ["timer-stop", new TimerStopHandler() as MinigameHandler],
]);

export function getMinigameHandler(type: string | undefined): MinigameHandler | null {
  if (!type) {
    return null;
  }
  return handlers.get(type) ?? null;
}
