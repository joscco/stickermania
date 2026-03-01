export interface BackendConfig {
    port: number;
    fieldWidth: number;
    fieldHeight: number;
    persistPath: string;
    shouldServeStatic: boolean;
    adminPassword: string | null;
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
    const fieldWidth: number = parseNumberEnv(process.env.FIELD_WIDTH, 1600);
    const fieldHeight: number = parseNumberEnv(process.env.FIELD_HEIGHT, 900);

    const persistPath: string =
        process.env.PERSIST_PATH ?? `${args.cwd}/world-state.json`;

    const shouldServeStatic: boolean = args.argv.includes("--serve-static");

    const adminPassword: string | null = process.env.ADMIN_PASSWORD ?? null;

    return {
        port,
        fieldWidth,
        fieldHeight,
        persistPath,
        shouldServeStatic,
        adminPassword
    };
}