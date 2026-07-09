import { loadConfig } from "./config.ts";
import { createGoSignalApp } from "./app.ts";

async function main(): Promise<void> {
  const config = loadConfig();
  const { app } = await createGoSignalApp(config);
  await app.start(config.port);
  console.log(`GoSignal listening on port ${config.port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
