# GoSignal

GoSignal is a Slack-native launch readiness agent for the Slack Agent Builder Challenge Track 3. This repository implements the hackathon MVP: analyze a launch thread, pull public Slack evidence in real time, build a durable markdown launch brief canvas, and drive one next action from a deterministic readiness engine.

## What ships in v1

- Thread-first readiness analysis using public Slack context.
- Deterministic classification for blockers, rollback risk, sign-offs, dependencies, and ambiguity.
- Markdown canvas generation for the durable launch brief.
- Block Kit message rendering for readiness boards, blockers, and actions.
- App Home listing of recent launches and rerun actions.
- In-memory storage by default with a Postgres adapter for hosted deployment.

## Project structure

- `manifest.json`: Slack app manifest tuned for the agent messaging experience.
- `src/app.ts`: Bolt app bootstrap and dependency wiring.
- `src/handlers/`: Slack event, shortcut, and action handlers.
- `src/domain/`: Launch models and deterministic readiness rules.
- `src/services/`: Launch orchestration, retrieval, canvas, and home rendering.
- `src/repositories/`: In-memory and Postgres persistence layers.
- `test/`: Unit and integration-style tests for the MVP flow.

## Local development

1. Copy `.env.example` to `.env` and fill in Slack credentials.
2. Install dependencies with `npm install`.
3. Run `npm run dev`.
4. Import `manifest.json` into Slack or use Slack CLI to wire the app to your workspace.
5. Create an app-level token and keep `Socket Mode` enabled for the easiest local setup.
6. Before Marketplace-style distribution, switch the app to HTTP mode with request URLs instead of Socket Mode.

## Runtime notes

- v1 is intentionally public-first for retrieval. Real-time Search results are only used when a user-triggered action provides an action token and the context is public-channel safe.
- The canvas is markdown-only by design. Interactive state stays in messages and App Home.
- The default LLM provider is deterministic and evidence-backed. No external model is required for the MVP.
