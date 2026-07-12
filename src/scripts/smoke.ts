import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

async function main(): Promise<void> {
  const port = await getAvailablePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      SLACK_SIGNING_SECRET: "smoke-signing-secret",
      SLACK_BOT_TOKEN: "xoxb-smoke-token",
      USE_SOCKET_MODE: "false",
      SLACK_TOKEN_VERIFICATION_ENABLED: "false",
      ENABLE_LLM_SUMMARIES: "false",
      DATABASE_URL: ""
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  const logs = {
    stdout: "",
    stderr: ""
  };

  child.stdout?.setEncoding("utf8");
  child.stderr?.setEncoding("utf8");
  child.stdout?.on("data", (chunk) => {
    logs.stdout += chunk;
  });
  child.stderr?.on("data", (chunk) => {
    logs.stderr += chunk;
  });

  try {
    await waitForHttpReady(port, child, logs);

    const rootResponse = await fetch(`http://127.0.0.1:${port}/`);
    if (!rootResponse.ok) {
      throw new Error(`Expected GET / to return 200, received ${rootResponse.status}.`);
    }
    const rootBody = await rootResponse.text();
    if (!rootBody.includes("GoSignal")) {
      throw new Error(`Expected GET / to mention GoSignal. Received: ${rootBody}`);
    }

    const healthResponse = await fetch(`http://127.0.0.1:${port}/healthz`);
    if (!healthResponse.ok) {
      throw new Error(`Expected GET /healthz to return 200, received ${healthResponse.status}.`);
    }

    const healthPayload = await healthResponse.json() as {
      ok?: boolean;
      service?: string;
      storage?: string;
      slack?: string;
    };

    if (healthPayload.ok !== true || healthPayload.service !== "gosignal") {
      throw new Error(`Unexpected /healthz payload: ${JSON.stringify(healthPayload)}`);
    }

    if (healthPayload.storage !== "memory" || healthPayload.slack !== "configured") {
      throw new Error(`Unexpected operational mode from /healthz: ${JSON.stringify(healthPayload)}`);
    }

    console.log("Smoke test passed.");
  } finally {
    child.kill("SIGTERM");
    await Promise.race([
      once(child, "exit"),
      delay(2_000).then(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      })
    ]);
  }
}

async function waitForHttpReady(
  port: number,
  child: ReturnType<typeof spawn>,
  logs: { stdout: string; stderr: string }
): Promise<void> {
  const deadline = Date.now() + 15_000;

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        `Production smoke server exited early with code ${child.exitCode}.\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`
      );
    }

    try {
      const response = await fetch(`http://127.0.0.1:${port}/healthz`);
      if (response.ok) {
        return;
      }
    } catch {
      // Keep polling until the server is ready or the deadline is hit.
    }

    await delay(250);
  }

  throw new Error(
    `Timed out waiting for the production smoke server on port ${port}.\nSTDOUT:\n${logs.stdout}\nSTDERR:\n${logs.stderr}`
  );
}

async function getAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Unable to allocate an ephemeral port for smoke testing."));
        return;
      }

      const { port } = address;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
