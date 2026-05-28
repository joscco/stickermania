import type {PartyGameState} from "@birthday/shared";
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

    public createInitialGameState(): PartyGameState {
        return this.get().createInitialState();
    }
}