# Submission Checklist

Use this file as the final pre-submit gate for the Track 3 package.

## Repo-Verified Today

- [x] `npm run verify` passes
- [x] `npm run smoke` passes
- [x] Production entrypoint starts from `server.js`
- [x] `GET /` exists
- [x] `GET /healthz` exists
- [x] App manifest includes agent view, App Home, message shortcut, canvases,
      and `org_deploy_enabled: true`
- [x] Workspace-scoped launch persistence exists
- [x] Optional Cerebras summarization is wired with deterministic fallback
- [x] Track 3 proof-pack docs exist in the repository
- [x] Hosted proof capture command exists
- [x] Launch profiles, owner assignment, history, and export flows exist

## Manual Evidence Still Required

- [ ] Marketplace submission screenshot or timestamp
- [ ] Final production App ID if different from `A0BH56L2ETS`
- [ ] Final hosted public URL
- [ ] Verified hosted `/healthz` response
- [ ] Final event request URL
- [ ] Final interactivity request URL
- [ ] Final OAuth redirect URL if used
- [ ] Install proof across five active workspaces
- [ ] Three-minute demo video

## Judge-Facing Assets

- [x] README with judge quickstart
- [x] `PROOF_CAPTURE.md`
- [x] `MARKETPLACE.md`
- [x] `ARCHITECTURE.md`
- [x] `SECURITY.md`
- [x] `PRIVACY.md`
- [x] `DATA_RETENTION.md`
- [x] `DEMO_RUNBOOK.md`
- [x] `LICENSE`
- [x] `CONTRIBUTING.md`

## Recommended Final Submission Bundle

- public repository link
- App ID
- architecture diagram
- demo video under three minutes
- Marketplace proof
- hosted URL
- Slack sandbox or install path
- honest known limitations

## Final Preflight Commands

Run these before shipping a new code revision:

```bash
npm run verify
npm run smoke
npm run check:llm
npm run proof:hosted -- https://your-final-app-url
```
