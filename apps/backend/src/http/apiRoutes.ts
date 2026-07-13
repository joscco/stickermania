import type {FastifyInstance} from "fastify";
import type {BackendConfig} from "../config.js";
import type {AssetRepository} from "../infrastructure/assetRepository.js";
import type {SessionService} from "../features/session-management/sessionService.js";
import {registerSessionManagementApiRoutes} from "../features/session-management/sessionApiRoutes.js";
import {registerStickerManagementApiRoutes} from "../features/sticker-management/stickerApiRoutes.js";

export async function registerApiRoutes(
    app: FastifyInstance,
    sessionService: SessionService,
    backendConfig: BackendConfig,
    assetRepository: AssetRepository,
): Promise<void> {
    await registerSessionManagementApiRoutes(app, sessionService, backendConfig, assetRepository);
    await registerStickerManagementApiRoutes(app, sessionService, assetRepository);
}
