# Privacy

This document explains what GoSignal currently collects, how it uses that data,
and which privacy gaps still remain before a full production distribution
posture.

## Product Scope

GoSignal is a Slack-native launch readiness agent. Its purpose is to analyze a
launch thread, summarize the readiness state, and create a durable launch brief
canvas.

## Data Collected

Current repository behavior may store the following in a launch record:

- workspace ID
- source channel ID
- source thread timestamp
- launch name
- category states and summaries
- approval states
- blockers
- evidence excerpts and summaries
- evidence metadata such as channel ID, permalink, and message timestamp
- decision summary and next action
- canvas ID and canvas label

App context snapshots may also store:

- workspace ID
- user ID
- last channel ID
- last thread timestamp
- timestamp of when the context was seen

## Data Sources

Current sources include:

- public Slack thread messages
- public Slack search results when a user action includes an action token
- App Home context for the current workspace
- App DM follow-up questions about an already analyzed launch

## What GoSignal Does Not Intend To Collect By Default

Current design intent:

- no secret values in health endpoints
- no hidden AI-only decisioning
- no private multi-workspace data mixing

Current limitation:

- there is not yet a self-service export or deletion UI

## How Data Is Used

Collected data is used to:

- determine readiness state
- explain blockers and missing sign-offs
- generate a launch brief canvas
- answer follow-up questions about an existing launch
- show recent launches, workspace settings, and audit events in App Home

## External Services

Depending on deployment choices, GoSignal may rely on:

- Slack APIs for message, search, canvas, and App Home interactions
- Render Web Service and Render Postgres if hosted there
- Cerebras only when optional LLM summarization is enabled

If the LLM layer is disabled, launch summaries remain deterministic.

## Retention And Deletion

Current behavior depends on storage mode:

- In-memory mode: launch data disappears when the process restarts.
- Postgres mode: launch data remains until rows are removed manually.

See [DATA_RETENTION.md](DATA_RETENTION.md) for the current deletion flow.

## Current Privacy Gaps Before Final Submission

- no self-service data deletion action in the product
- no dedicated privacy-only settings screen
- no deletion audit trail yet beyond the general operator ledger
- final hosted policy URLs still need to be referenced in the submission

## Support

- General support: `https://github.com/BitTriad/GoSignal/issues`
- Repository home: `https://github.com/BitTriad/GoSignal`
