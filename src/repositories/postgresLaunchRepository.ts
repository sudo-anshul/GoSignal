import { Pool } from "pg";
import type { LaunchRecord, LaunchKey } from "../domain/types.ts";
import type { LaunchRepository } from "./launchRepository.ts";

interface LaunchRow {
  id: string;
  workspace_id: string;
  source_channel_id: string;
  source_thread_ts: string;
  payload: LaunchRecord;
}

export class PostgresLaunchRepository implements LaunchRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
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
    `);
    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS launches_thread_key
      ON launches (workspace_id, source_channel_id, source_thread_ts);
    `);
  }

  async save(launch: LaunchRecord): Promise<LaunchRecord> {
    const row = await this.pool.query<LaunchRow>(
      `
        INSERT INTO launches (
          id,
          workspace_id,
          source_channel_id,
          source_thread_ts,
          created_by_user_id,
          name,
          status,
          canvas_id,
          payload,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11)
        ON CONFLICT (workspace_id, source_channel_id, source_thread_ts)
        DO UPDATE SET
          id = EXCLUDED.id,
          created_by_user_id = EXCLUDED.created_by_user_id,
          name = EXCLUDED.name,
          status = EXCLUDED.status,
          canvas_id = EXCLUDED.canvas_id,
          payload = EXCLUDED.payload,
          updated_at = EXCLUDED.updated_at
        RETURNING id, workspace_id, source_channel_id, source_thread_ts, payload;
      `,
      [
        launch.id,
        launch.workspaceId,
        launch.sourceChannelId,
        launch.sourceThreadTs,
        launch.createdByUserId,
        launch.name,
        launch.status,
        launch.canvasId ?? null,
        JSON.stringify(launch),
        launch.createdAt,
        launch.updatedAt
      ]
    );

    return row.rows[0]?.payload ?? launch;
  }

  async findByThread(key: LaunchKey): Promise<LaunchRecord | undefined> {
    const result = await this.pool.query<LaunchRow>(
      `
        SELECT id, workspace_id, source_channel_id, source_thread_ts, payload
        FROM launches
        WHERE workspace_id = $1 AND source_channel_id = $2 AND source_thread_ts = $3
        LIMIT 1;
      `,
      [key.workspaceId, key.sourceChannelId, key.sourceThreadTs]
    );
    return result.rows[0]?.payload;
  }

  async findById(id: string): Promise<LaunchRecord | undefined> {
    const result = await this.pool.query<LaunchRow>(
      `
        SELECT id, workspace_id, source_channel_id, source_thread_ts, payload
        FROM launches
        WHERE id = $1
        LIMIT 1;
      `,
      [id]
    );
    return result.rows[0]?.payload;
  }

  async listRecentForWorkspace(workspaceId: string, limit = 10): Promise<LaunchRecord[]> {
    const result = await this.pool.query<LaunchRow>(
      `
        SELECT id, workspace_id, source_channel_id, source_thread_ts, payload
        FROM launches
        WHERE workspace_id = $1
        ORDER BY updated_at DESC
        LIMIT $2;
      `,
      [workspaceId, limit]
    );
    return result.rows.map((row) => row.payload);
  }

  async findLatestByUser(workspaceId: string, userId: string): Promise<LaunchRecord | undefined> {
    const result = await this.pool.query<LaunchRow>(
      `
        SELECT id, workspace_id, source_channel_id, source_thread_ts, payload
        FROM launches
        WHERE workspace_id = $1 AND created_by_user_id = $2
        ORDER BY updated_at DESC
        LIMIT 1;
      `,
      [workspaceId, userId]
    );
    return result.rows[0]?.payload;
  }

  async searchByName(workspaceId: string, query: string, limit = 5): Promise<LaunchRecord[]> {
    const result = await this.pool.query<LaunchRow>(
      `
        SELECT id, workspace_id, source_channel_id, source_thread_ts, payload
        FROM launches
        WHERE workspace_id = $1 AND LOWER(name) LIKE $2
        ORDER BY updated_at DESC
        LIMIT $3;
      `,
      [workspaceId, `%${query.toLowerCase()}%`, limit]
    );
    return result.rows.map((row) => row.payload);
  }
}
