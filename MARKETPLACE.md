# Marketplace Readiness

This document tracks what GoSignal can already prove from the repository and
what still needs manual evidence before a final Track 3 submission.

## Current Status

| Field | Current status |
| --- | --- |
| Public repo | `https://github.com/BitTriad/GoSignal` |
| Current Slack App ID | `A0BH56L2ETS` |
| App source | Slack CLI-bound development app from `.slack/apps.dev.json` |
| Manifest org deploy | `true` |
| Current runtime mode | Socket Mode enabled by default |
| Current install path | Manifest import or Slack CLI |
| Preferred hosting path | Render Web Service + PostgreSQL |
| Public hosted URL | Pending live verification |
| Marketplace submission proof | Pending manual capture |
| Five active workspace proof | Pending manual capture |

If the final submission uses a different production app, replace the current
App ID everywhere in this proof pack.

Use [PROOF_CAPTURE.md](PROOF_CAPTURE.md) as the final worksheet for hosted
deployment proof, Marketplace evidence, and the five-workspace install matrix.

## Current Slack App Capabilities

Verified in `manifest.json`:

- Agent view
- App Home
- Bot user
- Message shortcut: `Analyze launch readiness`
- Canvases
- Public search scopes for live workspace context
- `org_deploy_enabled: true`

## Current Policy And Support URLs

These GitHub-hosted docs can be used as interim policy links for the hackathon
submission until a dedicated site exists.

- Repository home: `https://github.com/BitTriad/GoSignal`
- Support URL: `https://github.com/BitTriad/GoSignal/issues`
- Privacy policy: `https://github.com/BitTriad/GoSignal/blob/main/PRIVACY.md`
- Security policy: `https://github.com/BitTriad/GoSignal/blob/main/SECURITY.md`
- Data retention policy:
  `https://github.com/BitTriad/GoSignal/blob/main/DATA_RETENTION.md`
- Terms or license: `https://github.com/BitTriad/GoSignal/blob/main/LICENSE`

## OAuth, Request URLs, And Distribution Status

Current repo truth:

- Socket Mode is enabled in the manifest for development.
- HTTP request URLs are not yet documented as live production endpoints.
- OAuth redirect URLs are not yet captured in the proof pack.
- Token rotation is still disabled in the manifest.

Before final Marketplace-style submission:

1. Deploy the hosted app and verify the final public URL.
2. Switch to `USE_SOCKET_MODE=false` if final judging depends on production
   request URLs instead of Socket Mode.
3. Record the event request URL.
4. Record the interactivity request URL.
5. Record the OAuth redirect URL if the final install path uses OAuth.
6. Capture a Marketplace submission screenshot or timestamp.

## Current Install And Admin Flow

1. Create or bind the Slack app using `manifest.json` or Slack CLI.
2. Install the app into the target workspace.
3. Invite the bot into the public launch channel that will be analyzed.
4. Use the `Analyze launch readiness` message shortcut on a launch thread, or
   mention `@GoSignal` directly inside that thread.
5. Open App Home to confirm the app is publishing workspace-scoped launches,
   workspace settings, and audit history.
6. Use `Workspace settings` in App Home to choose thread-only or public-search
   mode, set the default launch profile, and choose the audit retention window.
7. Use `Re-run readiness`, `Request sign-off`, `Assign owner`, `View history`,
   `Export brief`, or `Open launch brief` from the generated thread response.

Current limitation:

- There is still no deletion control, channel allowlist, or required-role
  configuration screen yet.

## Scope Review

Current grouped scope intent:

| Scope group | Current scopes | Why they are present |
| --- | --- | --- |
| Slack agent + surfaces | `assistant:write`, `chat:write`, `chat:write.public`, `canvases:write` | Post replies, power the agent flow, and create launch brief canvases |
| Public launch context | `channels:history`, `channels:read`, `app_mentions:read` | Read the public launch thread and respond to mentions |
| DM follow-up flow | `im:history`, `im:read`, `im:write` | Answer questions about an already analyzed launch in app DMs |
| Search context | `search:read.public`, `search:read.files`, `search:read.users`, `files:read` | Pull public cross-workspace evidence when a user action includes an action token |
| Miscellaneous | `commands`, `users:read` | Present in the current manifest; review for least privilege before final submission |

## External Evidence Still Required

- Marketplace submission screenshot or submission timestamp
- Final production App ID if it differs from `A0BH56L2ETS`
- Final hosted URL
- Final event request URL
- Final interactivity request URL
- Final OAuth redirect URL if used
- Install proof across five active workspaces
- Screenshot or capture of App Home in at least one non-demo workspace

## Practical Submission Guidance

For a strong Track 3 submission, the repo should be treated as one half of the
proof. The other half must be captured manually:

- a real hosted deployment,
- a real Marketplace or install path,
- and real multi-workspace evidence.

This file exists so those manual artifacts have a precise place to be attached
or referenced before final submission.
