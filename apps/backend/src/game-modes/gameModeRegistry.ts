import type {DrawSearchModeState, GameModeId, GardenModeState, TeamGraffitiModeState, UnknownModeState,} from "@birthday/shared";
import type {GameModeEngine} from "./gameModeEngine.js";

export type AnyGameModeEngine =
    | GameModeEngine<"draw-search", DrawSearchModeState>
    | GameModeEngine<"garden-coop", GardenModeState>
    | GameModeEngine<"team-graffiti", TeamGraffitiModeState>;

export class GameModeRegistry {
    private readonly engines = new Map<GameModeId, AnyGameModeEngine>();

    public register(engine: AnyGameModeEngine): void {
        this.engines.set(engine.mode, engine);
    }

    public get(mode: GameModeId): AnyGameModeEngine {
        const engine = this.engines.get(mode);

        if (!engine) {
            throw new Error(`No game mode engine registered for mode "${mode}"`);
        }

        return engine;
    }

    public createInitialModeState(mode: GameModeId): UnknownModeState {
        const engine = this.get(mode);
        return engine.createInitialState();
    }
}