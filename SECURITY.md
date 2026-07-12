# Security

This document describes the current security posture of the GoSignal repository
and the remaining gaps before a full production Marketplace posture.

## Current Controls Implemented In The Repo

- Secrets are loaded from environment variables, not hardcoded into the app.
- `.env` is gitignored.
- Production health endpoints do not expose tokens, workspace IDs, or secret
  values.
- Launch records are stored with workspace-scoped keys.
- Repository queries are workspace-scoped for recent launches, DM lookup, and
  name search.
- The readiness engine is deterministic and explainable.
- The optional LLM layer is used for phrasing only, with deterministic
  fallback if the provider fails.

## Slack Data Scope

Current repository behavior:

- Public launch thread analysis is the primary supported path.
- Public search evidence is the current search target.
- App DMs are used to ask follow-up questions about already stored launches.

Current limitations:

- There is no dedicated UI yet for channel allowlists.
- There is no install-time permissions review surface inside the app.
- Final Marketplace least-privilege scope trimming still needs a manual pass.

## Token Handling

Expected environment variables include:

- `SLACK_SIGNING_SECRET`
- `SLACK_BOT_TOKEN`
- `SLACK_APP_TOKEN` when Socket Mode is enabled
- `DATABASE_URL` when Postgres is enabled
- optional Cerebras settings for the LLM layer

Current repository truth:

- Token rotation is still disabled in `manifest.json`.
- There is no encrypted installation store yet.
- Production OAuth redirect management is not yet documented as complete.

## Storage And Tenant Isolation

Launch persistence is keyed by workspace and thread identity.

Current storage paths:

- In-memory repository for development
- Postgres repository for hosted deployment
- Workspace settings and audit storage for admin-facing controls

Current known gaps:

- No dedicated installations table yet
- No self-service workspace deletion UI yet

## LLM And External Providers

If Cerebras is enabled:

- launch summaries and DM answers are generated from structured launch data
- deterministic status remains authoritative
- if the provider fails, GoSignal falls back to deterministic output

Current limitation:

- There is no separate policy enforcement layer yet that validates cited
  evidence IDs in model output

## Incident And Support Handling

Current support path:

- General support: `https://github.com/BitTriad/GoSignal/issues`

Security-specific gap:

- A dedicated private security disclosure contact is still needed before final
  production Marketplace submission.
- Until that exists, do not post secrets or live credentials in public issues.

## Security Gaps Still Open Before Final Submission

- Dedicated security contact or disclosure email
- Token rotation review
- Encrypted installation store
- Admin deletion path inside the product
- Channel allowlist settings
- Explicit private-channel and unknown-visibility handling surface
- Private security disclosure flow outside public GitHub issues
