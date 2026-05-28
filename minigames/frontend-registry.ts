import type {MinigameTask} from "@birthday/shared";
import type {MinigameFrontendDefinition} from "./frontend-definition";
import {ESTIMATE_OPINIONS_FRONTEND_DEFINITION} from "./estimate-opinions/frontend-definition";
import {TIMER_STOP_FRONTEND_DEFINITION} from "./timer-stop/frontend-definition";
import {UNEXPECTED_TASK_FRONTEND_DEFINITION} from "./unexpected-task/frontend-definition";

export type {MinigameFrontendDefinition} from "./frontend-definition";

const definitions: MinigameFrontendDefinition[] = [
  TIMER_STOP_FRONTEND_DEFINITION,
  ESTIMATE_OPINIONS_FRONTEND_DEFINITION,
  UNEXPECTED_TASK_FRONTEND_DEFINITION,
];

export function getMinigameFrontendDefinitions(): MinigameFrontendDefinition[] {
  return definitions;
}

export function getMinigameFrontendDefinition(
  type: string | undefined,
): MinigameFrontendDefinition | null {
  if (!type) return null;
  return definitions.find((definition) => definition.type === type) ?? null;
}

export function getMinigameCatalogTasks(): MinigameTask[] {
  return definitions.flatMap((definition) =>
    definition.variants.map((variant) =>
      definition.taskFromVariant(variant as never),
    ),
  );
}
