import type {StickerCollageGameState} from "@birthday/shared";
import type {GameEngine} from "./gameModeEngine.js";

export class GameEngineRegistry {
    private engine: GameEngine | null = null;

    public register(engine: GameEngine): void {
        this.engine = engine;
    }

    public get(): GameEngine {
        if (!this.engine) {
            throw new Error("No game engine registered");
        }
        return this.engine;
    }

    public createInitialGameState(): StickerCollageGameState {
        return this.get().createInitialState();
    }
}