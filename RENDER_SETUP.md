# Render Setup

This is the recommended non-Azure hosting path for GoSignal.

## What This Setup Uses

- Render Web Service for the Slack app
- Render Postgres or another PostgreSQL provider for persistence
- GitHub Actions for CI
- A Render deploy hook for automatic production deploys after CI passes

## Files Already Added To This Repo

- `render.yaml`
- `.node-version`
- `.github/workflows/render-deploy.yml`

## One-Time Render Setup

1. Push the current repository to GitHub.
2. In Render, create a new Web Service from the GitHub repo.
3. When Render detects the repo:
   - Runtime: `Node`
   - Build command: `npm ci && npm run verify`
   - Start command: `npm start`
   - Health check path: `/healthz`
4. In the same Render workspace, create a PostgreSQL database.
5. Copy the database's internal connection string and set it as
   `DATABASE_URL` for the web service.

## Required Render Environment Variables

Set these in the Render Dashboard for the GoSignal web service:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN`
- `DATABASE_URL`
- `USE_SOCKET_MODE=true`
- `SLACK_TOKEN_VERIFICATION_ENABLED=true`
- `ENABLE_LLM_SUMMARIES=false`

Optional if you want Cerebras summaries:

- `ENABLE_LLM_SUMMARIES=true`
- `LLM_PROVIDER=cerebras`
- `CEREBRAS_API_KEY`
- `CEREBRAS_MODEL`
- `CEREBRAS_BASE_URL`
- `CEREBRAS_REASONING_EFFORT=none`

## GitHub Actions Deployment Setup

The workflow in `.github/workflows/render-deploy.yml` already:

- runs `npm run verify`
- runs `npm run smoke`
- triggers Render only after CI succeeds

To connect it:

1. In Render, open the GoSignal service.
2. Find the service's deploy hook URL.
3. In GitHub, add a repository secret named `RENDER_DEPLOY_HOOK_URL`.
4. Push to `main`.

After that:

- every pull request runs CI only
- every successful push to `main` runs CI and then triggers a Render deploy

## Important Render Setting

To avoid duplicate deploys, set the Render service's automatic Git deploy
behavior to off if you are using the deploy hook workflow.

If you prefer Render-native deploys instead of the deploy hook:

- remove the deploy-hook secret
- set Render to deploy from GitHub automatically
- optionally configure Render to deploy only after CI checks pass

## Post-Deploy Checks

After the first Render deploy:

1. Open the service URL.
2. Visit `/healthz`.
3. Run:

```bash
npm run proof:hosted -- https://your-render-service.onrender.com
```

4. Confirm the Slack bot still responds in your workspace.

## Recommended First Render Pass

For an initial demo or hackathon preview:

- start with the web service plus Postgres
- keep Socket Mode enabled
- keep `ENABLE_LLM_SUMMARIES=false` until the base deploy is healthy

Once the hosted app is stable, you can re-enable Cerebras and capture the final
proof pack artifacts.
