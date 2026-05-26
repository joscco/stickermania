import type {MinigameHandler} from './types.js';
import type {MinigameTask} from '../index.js';

class MinigameRegistry {
  private readonly handlers = new Map<string, MinigameHandler>();

  register(handler: MinigameHandler): void {
    this.handlers.set(handler.type, handler);
  }

  getHandler(taskType: string): MinigameHandler | undefined {
    return this.handlers.get(taskType);
  }

  getHandlerForTask(task: MinigameTask): MinigameHandler | undefined {
    return this.handlers.get(task.type);
  }
}

export const minigameRegistry = new MinigameRegistry();
