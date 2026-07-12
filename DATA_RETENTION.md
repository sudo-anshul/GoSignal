# Data Retention

This document records the current retention behavior of GoSignal and the manual
deletion flow that exists today.

## Current Storage Modes

| Mode | Current behavior |
| --- | --- |
| In-memory repository | Launch records disappear when the process restarts |
| Postgres repository | Launch records persist until rows are manually removed |

## Current Repository Truth

GoSignal does not yet implement:

- an automatic TTL purge
- a self-service admin deletion UI

That means retention is currently an operational policy, not an automated
product control.

## Recommended Demo And Hackathon Policy

- Keep demo workspaces short-lived.
- Use a separate database for demo or judging data.
- Purge demo launches after judging or when resetting the workspace.
- Avoid storing unnecessary production-like test data in the hackathon
  environment.

## Manual Deletion Flow

### In-Memory Mode

If GoSignal is running with the in-memory repository:

- stop the process
- restart the app

This clears stored launch records.

### Postgres Mode

If GoSignal is running with Postgres:

- remove rows from the `launches` table
- scope deletes by `workspace_id` or `id`

Examples:

Delete one launch by ID:

```sql
DELETE FROM launches
WHERE id = '<launch-id>';
```

Delete all launches for one workspace:

```sql
DELETE FROM launches
WHERE workspace_id = '<workspace-id>';
```

Clear the entire table:

```sql
TRUNCATE TABLE launches;
```

Use the broad table clear only in demo or reset environments.

## Data Included In Stored Launch Rows

Each launch row includes a JSON payload containing:

- launch summary fields
- approvals
- blockers
- evidence excerpts
- source metadata
- canvas linkage

This means manual deletion of the row also removes the stored evidence snapshot
that GoSignal kept for that launch.

## Canvas Retention Note

The current repository stores the canvas ID and label in the launch record.
Canvas content itself lives in Slack. If you need full cleanup, remove the
launch row and also delete or replace the Slack canvas through the Slack app
surface or an admin workflow once that exists.

## Gaps Before Final Submission

- No automated retention schedule
- No admin-triggered deletion button in the UI
- No automated purge tied to the workspace retention setting
- No audit ledger for deletion events yet
