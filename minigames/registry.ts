import type {MinigameHandler, MinigameTask} from "@birthday/shared";
import {EstimateOpinionsHandler} from "./estimate-opinions/server-handler.js";
import {TimerStopHandler} from "./timer-stop/server-handler.js";

const handlers = new Map<string, MinigameHandler>([
  ["estimate-opinions", new EstimateOpinionsHandler() as MinigameHandler],
  ["timer-stop", new TimerStopHandler() as MinigameHandler],
]);

export function getMinigameHandler(type: string | undefined): MinigameHandler | null {
  if (!type) {
    return null;
  }
  return handlers.get(type) ?? null;
}

export function getMinigameTasks(): MinigameTask[] {
  return Array.from(handlers.values()).flatMap((handler) => handler.createTasks?.() ?? []);
}
