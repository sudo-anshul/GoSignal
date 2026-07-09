import "dotenv/config";

export interface AppConfig {
  port: number;
  slackSigningSecret: string;
  slackBotToken: string;
  slackAppToken: string | undefined;
  databaseUrl: string | undefined;
  useSocketMode: boolean;
  enableLlmSummaries: boolean;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }
  return value.toLowerCase() === "true";
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 3000),
    slackSigningSecret: requireEnv("SLACK_SIGNING_SECRET"),
    slackBotToken: requireEnv("SLACK_BOT_TOKEN"),
    slackAppToken: process.env.SLACK_APP_TOKEN,
    databaseUrl: process.env.DATABASE_URL,
    useSocketMode: parseBoolean(process.env.USE_SOCKET_MODE, false),
    enableLlmSummaries: parseBoolean(process.env.ENABLE_LLM_SUMMARIES, false)
  };
}
