# GoSignal

GoSignal is an organization-ready Slack launch readiness agent. It turns a messy
launch thread plus live workspace evidence into a durable go/no-go brief:
blockers, missing sign-offs, rollback risk, dependencies, evidence-backed
reasoning, and one accountable next action.

Built for Slack Agent Builder Challenge Track 3: Organizations.

## 30-Second Judge Quickstart

1. Install GoSignal in a workspace and invite it to a public demo channel.
2. Open a seeded launch thread in that channel.
3. Use the `Analyze launch readiness` message shortcut or mention `@GoSignal`
   in the thread.
4. Review the readiness board and open the launch brief canvas.
5. Add the missing sign-off and click `Re-run readiness`.
6. Open App Home to confirm the launch history, workspace settings, and audit
   history are scoped to the current workspace.

## Submission Snapshot

- Public repo: `BitTriad/GoSignal`
- Slack App ID: `A0BH56L2ETS`
  - This is the current Slack CLI-bound development app from `.slack/apps.dev.json`.
  - If the final submission uses a different production app, replace this value
    everywhere in the proof pack.
- Current install model: manifest import or Slack CLI-managed development app
- Current runtime: Bolt JS with Slack app capabilities, canvases, App Home,
  message shortcut, agent view, and optional Cerebras summarization
- Current storage: in-memory by default, Postgres adapter available
- Current deploy target name: `gosignal` on Render
- Hosted public URL: pending live verification
- Marketplace submission proof: pending manual capture
- Five active workspace proof: pending manual capture

## Why GoSignal Fits Track 3

- It solves an organization workflow that already lives in Slack: release and
  launch go/no-go decisions.
- It creates a durable artifact, not just a chat answer: a markdown launch
  brief canvas backed by evidence.
- It stays explainable: deterministic readiness logic decides blockers,
  approvals, ambiguity, and overall state.
- It is designed for workspace-safe installation: launch data is keyed by
  `workspace_id` and thread identity in both memory and Postgres storage paths.
- It has a real operator surface: thread actions, App Home, rerun flow, and
  sign-off request flow.
- It now supports configurable launch profiles, owner assignment/reminders,
  launch history, and export-ready briefs inside Slack.

## Proof Pack

- [Marketplace readiness](MARKETPLACE.md)
- [Proof capture](PROOF_CAPTURE.md)
- [Render setup](RENDER_SETUP.md)
- [Architecture](ARCHITECTURE.md)
- [Security](SECURITY.md)
- [Privacy](PRIVACY.md)
- [Data retention](DATA_RETENTION.md)
- [Demo runbook](DEMO_RUNBOOK.md)
- [Submission checklist](SUBMISSION_CHECKLIST.md)
- [Contributing](CONTRIBUTING.md)
- [License](LICENSE)

## Repo-Verified Status

- Verified in repo:
  - App manifest includes agent view, App Home, message shortcut, canvases, and
    `org_deploy_enabled: true`.
  - The app serves `GET /` and `GET /healthz` from the production artifact.
  - `npm run verify` passes.
  - `npm run smoke` passes.
  - Workspace-scoped persistence exists for both in-memory and Postgres storage.
  - App Home publishes recent launches, workspace settings, and audit events
    for the current workspace.
  - Optional Cerebras summarization is integrated with deterministic fallback.
- Still requires external submission evidence:
  - Marketplace submission timestamp or screenshot
  - Final hosted URL and healthy `/healthz` response from the deployed app
  - Final install URL or OAuth path
  - Proof of installation in five active workspaces
  - Final demo video under three minutes

## Core Product Flow

1. A user triggers GoSignal from a launch thread using the message shortcut or
   an app mention.
2. GoSignal reads the current thread and, when Slack provides an action token,
   queries public workspace context through Slack search. If live search is not
   available, the thread reply and launch brief show that diagnostic explicitly.
3. The deterministic readiness engine classifies approvals, blockers,
   ambiguity, rollback status, dependencies, profile-specific evidence, and
   next action.
4. GoSignal posts a readiness board back into the thread, including evidence
   counts, live search diagnostics, and cross-channel evidence receipts.
5. GoSignal creates or updates a markdown launch brief canvas.
6. App Home shows recent launches, at-risk launches, missing sign-offs,
   workspace settings, and operator audit events for the current workspace.
7. A user can rerun readiness, request the missing sign-off, assign an owner,
   remind that owner, open launch history, or export the brief from Slack.

## Project Structure

- `manifest.json`: Slack app manifest tuned for the agent messaging experience
- `src/app.ts`: Bolt app bootstrap, routes, and dependency wiring
- `src/handlers/`: Slack event, shortcut, and action handlers
- `src/domain/`: launch models and deterministic readiness rules
- `src/services/`: launch orchestration, workspace admin controls, retrieval,
  canvas, and home rendering
- `src/repositories/`: in-memory and Postgres persistence for launches,
  workspace settings, and audit events
- `src/http/customRoutes.ts`: production health endpoints
- `src/scripts/`: LLM and production smoke verification utilities
- `test/`: unit and integration-style tests for the MVP flow

## Local Development

1. Copy `.env.example` to `.env` and fill in Slack credentials.
2. Install dependencies with `npm install`.
3. Run `npm run dev` for a one-shot local process, or `npm run dev:watch`
   while iterating on TypeScript files.
4. Use `slack run` if you want Slack CLI-managed local development. This
   repository includes the `.slack/` project files and a CLI hook that starts
   GoSignal through `npm run dev:watch`.
5. Import `manifest.json` into Slack or use Slack CLI to bind the app to your
   workspace.
6. Create an app-level token and keep Socket Mode enabled for the easiest local
   setup.
7. Run `npm run verify` before pushing changes.
8. Run `npm run smoke` after `npm run build` to verify the production artifact
   serves `GET /` and `GET /healthz`.

## Optional LLM Mode

- Keep `ENABLE_LLM_SUMMARIES=false` to use the deterministic provider only.
- To enable more natural summaries and DM answers, set:
  - `ENABLE_LLM_SUMMARIES=true`
  - `LLM_PROVIDER=cerebras`
  - `CEREBRAS_API_KEY`
  - Optional `CEREBRAS_MODEL`, `CEREBRAS_BASE_URL`, and
    `CEREBRAS_REASONING_EFFORT`
- Recommended for GoSignal: `CEREBRAS_REASONING_EFFORT=none`.
- Run `npm run check:llm` to verify the exact Cerebras path GoSignal uses in
  production.
- The deterministic readiness engine remains the source of truth. The LLM only
  rewrites grounded results into more natural language and answers follow-up
  questions from the stored launch record.

## Render Deployment

GoSignal is set up to deploy to Render with GitHub Actions handling CI and the
Render deploy hook handling production deployment.

### Database Choice For Render

Use Render Postgres or another managed PostgreSQL provider for GoSignal.

- GoSignal persists launches through `pg` in
  `src/repositories/postgresLaunchRepository.ts`.
- The current schema uses PostgreSQL tables, a unique index, and `JSONB`
  payload storage in `src/repositories/schema.sql`.
- Do not use a MongoDB-only datastore for this codebase unless you plan to
  rewrite the persistence layer.

### Deployment Notes

- `render.yaml` describes the Render-friendly service setup that belongs with
  this repository.
- `.node-version` pins the major Node runtime for Render.
- `npm run build` compiles the production app into `dist/` using
  `tsconfig.build.json`.
- `npm start` runs the production build through the root `server.js` entrypoint.
- `GET /` and `GET /healthz` are available for smoke tests and Render health
  checks.
- `npm run verify` checks types, runs tests, builds the production bundle, and
  validates `server.js`.
- `npm run smoke` starts the built app with safe local test settings and
  verifies both production health routes.
- The GitHub Actions workflow runs verification and smoke tests before
  triggering Render on pushes to `main`.

### One-Time Render Setup

1. Create a Render web service from this repository.
2. Create a PostgreSQL database and set `DATABASE_URL` on the web service.
3. In the Render service, add:
   - `SLACK_SIGNING_SECRET`
   - `SLACK_BOT_TOKEN`
   - `SLACK_APP_TOKEN`
   - `DATABASE_URL`
   - `USE_SOCKET_MODE=true`
   - `SLACK_TOKEN_VERIFICATION_ENABLED=true`
   - `ENABLE_LLM_SUMMARIES=false` unless you enable the optional LLM layer
4. Create a Render deploy hook for the web service.
5. In GitHub, add the repository secret `RENDER_DEPLOY_HOOK_URL`.
6. Push to `main`. GitHub Actions will verify the repo and then trigger Render.
7. Follow [RENDER_SETUP.md](RENDER_SETUP.md) for the exact walkthrough.

## Known Limitations

- The current default install flow is Socket Mode for development. Final
  Marketplace-style distribution should switch to HTTP request URLs.
- Search usage is public-first and currently strongest when invoked by a user
  action that provides an action token.
- The repo does not yet include final Marketplace submission proof, five active
  workspace proof, or a verified hosted health URL.
- Required-role overrides, channel allowlists, and self-service deletion are
  still not implemented.
- There is still no self-service deletion UI or automated purge flow. The
  current deletion path is documented separately.
- The current proof pack is honest by design: anything still pending manual
  capture is marked as pending instead of being presented as complete.
