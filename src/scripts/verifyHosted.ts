import "dotenv/config";

interface HealthPayload {
  ok?: boolean;
  service?: string;
  version?: string;
  storage?: string;
  slack?: string;
  socketMode?: boolean;
  llm?: string;
}

function resolveBaseUrl(): string {
  const direct = process.argv[2]?.trim();
  const fromEnv = process.env.PUBLIC_BASE_URL?.trim();
  const candidate = direct || fromEnv;

  if (!candidate) {
    throw new Error("Pass the hosted base URL as the first argument or set PUBLIC_BASE_URL.");
  }

  return candidate.replace(/\/$/, "");
}

function summarizeRoot(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 300) {
    return trimmed;
  }
  return `${trimmed.slice(0, 297)}...`;
}

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with ${response.status}. Response body: ${body}`);
  }

  return {
    status: response.status,
    body
  };
}

async function fetchHealth(url: string): Promise<{ status: number; payload: HealthPayload }> {
  const response = await fetch(url);
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with ${response.status}. Response body: ${body}`);
  }

  let payload: HealthPayload;
  try {
    payload = JSON.parse(body) as HealthPayload;
  } catch {
    throw new Error(`Health response from ${url} was not valid JSON. Raw body: ${body}`);
  }

  if (payload.ok !== true || payload.service !== "gosignal") {
    throw new Error(`Health response from ${url} did not look like GoSignal: ${body}`);
  }

  return {
    status: response.status,
    payload
  };
}

async function main(): Promise<void> {
  const baseUrl = resolveBaseUrl();
  const capturedAt = new Date().toISOString();
  const rootUrl = `${baseUrl}/`;
  const healthUrl = `${baseUrl}/healthz`;

  const root = await fetchText(rootUrl);
  const health = await fetchHealth(healthUrl);

  console.log("# Hosted Proof Capture");
  console.log("");
  console.log(`- Captured at: ${capturedAt}`);
  console.log(`- Base URL: ${baseUrl}`);
  console.log(`- Root URL: ${rootUrl}`);
  console.log(`- Health URL: ${healthUrl}`);
  console.log(`- Root status: ${root.status}`);
  console.log(`- Health status: ${health.status}`);
  console.log("");
  console.log("## Root response");
  console.log("```text");
  console.log(summarizeRoot(root.body));
  console.log("```");
  console.log("");
  console.log("## Health response");
  console.log("```json");
  console.log(JSON.stringify(health.payload, null, 2));
  console.log("```");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
