export interface BackendConfig {
    port: number;
    gridWidth: number;
    gridHeight: number;
    persistPath: string;
    shouldServeStatic: boolean;
}

function parseNumberEnv(value: string | undefined, fallbackValue: number): number {
    if (!value) {
        return fallbackValue;
    }

    const parsed: number = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
        return fallbackValue;
    }

    return parsed;
}

export function loadBackendConfig(args: { argv: string[]; cwd: string }): BackendConfig {
    const port: number = parseNumberEnv(process.env.PORT, 3001);
    const gridWidth: number = parseNumberEnv(process.env.GRID_WIDTH, 30);
    const gridHeight: number = parseNumberEnv(process.env.GRID_HEIGHT, 20);

    const persistPath: string =
        process.env.PERSIST_PATH ?? `${args.cwd}/world-state.json`;

    const shouldServeStatic: boolean = args.argv.includes("--serve-static");

    return {
        port,
        gridWidth,
        gridHeight,
        persistPath,
        shouldServeStatic
    };
}