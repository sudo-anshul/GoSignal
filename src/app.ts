import { App } from "@slack/bolt";
import { describeResponseMode, type AppConfig } from "./config.ts";
import { MemoryContextStore } from "./repositories/contextStore.ts";
import { MemoryLaunchRepository } from "./repositories/memoryLaunchRepository.ts";
import { PostgresLaunchRepository } from "./repositories/postgresLaunchRepository.ts";
import type { LaunchRepository } from "./repositories/launchRepository.ts";
import {
  MemoryWorkspaceAdminRepository,
  PostgresWorkspaceAdminRepository
} from "./repositories/workspaceAdminRepository.ts";
import { registerHandlers } from "./handlers/registerHandlers.ts";
import { HomeService } from "./services/homeService.ts";
import { LaunchService } from "./services/launchService.ts";
import { CerebrasLLMProvider, DeterministicSummaryProvider, type LLMProvider } from "./services/llmProvider.ts";
import { buildCustomRoutes } from "./http/customRoutes.ts";
import { SlackCanvasGateway, SlackSearchSource, SlackThreadSource } from "./services/slackSources.ts";
import { WorkspaceAdminService } from "./services/workspaceAdminService.ts";

export async function createGoSignalApp(config: AppConfig): Promise<{ app: App; repository: LaunchRepository }> {
  const repository = config.databaseUrl
    ? new PostgresLaunchRepository(config.databaseUrl)
    : new MemoryLaunchRepository();
  const workspaceAdminRepository = config.databaseUrl
    ? new PostgresWorkspaceAdminRepository(config.databaseUrl)
    : new MemoryWorkspaceAdminRepository();

  if (repository instanceof PostgresLaunchRepository) {
    await repository.initialize();
  }
  if (workspaceAdminRepository instanceof PostgresWorkspaceAdminRepository) {
    await workspaceAdminRepository.initialize();
  }

  if (config.useSocketMode && !config.slackAppToken) {
    throw new Error("SLACK_APP_TOKEN is required when USE_SOCKET_MODE=true");
  }

  const summaryProvider = createSummaryProvider(config);
  const workspaceAdminService = new WorkspaceAdminService({
    settingsRepository: workspaceAdminRepository,
    auditRepository: workspaceAdminRepository
  });

  const app = new App({
    token: config.slackBotToken,
    signingSecret: config.slackSigningSecret,
    socketMode: config.useSocketMode,
    tokenVerificationEnabled: config.slackTokenVerificationEnabled,
    customRoutes: buildCustomRoutes(config),
    ...(config.slackAppToken ? { appToken: config.slackAppToken } : {})
  });

  const launchService = new LaunchService({
    repository,
    threadSource: new SlackThreadSource(),
    searchSource: new SlackSearchSource(),
    canvasGateway: new SlackCanvasGateway(),
    summaryProvider,
    workspaceAdminService
  });

  registerHandlers(app, {
    contextStore: new MemoryContextStore(),
    launchService,
    homeService: new HomeService({
      launchService,
      workspaceAdminService,
      responseMode: describeResponseMode(config)
    }),
    workspaceAdminService
  });

  return {
    app,
    repository
  };
}

function createSummaryProvider(config: AppConfig): LLMProvider {
  const deterministic = new DeterministicSummaryProvider();

  if (!config.enableLlmSummaries) {
    return deterministic;
  }

  if (config.llmProvider === "cerebras" && config.cerebrasApiKey) {
    return new CerebrasLLMProvider({
      apiKey: config.cerebrasApiKey,
      model: config.cerebrasModel,
      baseUrl: config.cerebrasBaseUrl,
      reasoningEffort: config.cerebrasReasoningEffort,
      fallback: deterministic
    });
  }

  return deterministic;
}
