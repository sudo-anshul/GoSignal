import type { CustomRoute } from "@slack/bolt";
import type { AppConfig } from "../config.ts";

interface HealthResponse {
  ok: true;
  service: "gosignal";
  version: string;
  storage: "memory" | "postgres";
  slack: "configured";
  socketMode: boolean;
  llm: "disabled" | "deterministic" | "cerebras";
}

export function buildCustomRoutes(config: AppConfig): CustomRoute[] {
  return [
    {
      path: "/",
      method: ["GET"],
      handler: (_req, res) => {
        sendText(
          res,
          "GoSignal is running.\nUse /healthz for a machine-readable status check.\n"
        );
      }
    },
    {
      path: "/healthz",
      method: ["GET"],
      handler: (_req, res) => {
        sendJson(res, {
          ok: true,
          service: "gosignal",
          version: process.env.npm_package_version ?? "0.1.0",
          storage: config.databaseUrl ? "postgres" : "memory",
          slack: "configured",
          socketMode: config.useSocketMode,
          llm: resolveLlmMode(config)
        } satisfies HealthResponse);
      }
    }
  ];
}

function resolveLlmMode(config: AppConfig): HealthResponse["llm"] {
  if (!config.enableLlmSummaries) {
    return "disabled";
  }

  return config.llmProvider;
}

function sendJson(res: { writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void }, body: HealthResponse): void {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function sendText(res: { writeHead: (statusCode: number, headers: Record<string, string>) => void; end: (body: string) => void }, body: string): void {
  res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(body);
}
