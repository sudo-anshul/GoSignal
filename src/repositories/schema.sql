CREATE TABLE IF NOT EXISTS launches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source_channel_id TEXT NOT NULL,
  source_thread_ts TEXT NOT NULL,
  created_by_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  canvas_id TEXT,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS launches_thread_key
ON launches (workspace_id, source_channel_id, source_thread_ts);
