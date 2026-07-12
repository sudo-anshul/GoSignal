import { Pool } from "pg";
import type { AuditEventRecord, WorkspaceSettingsRecord } from "../domain/types.ts";

export interface WorkspaceSettingsRepository {
  get(workspaceId: string): Promise<WorkspaceSettingsRecord | undefined>;
  save(settings: WorkspaceSettingsRecord): Promise<WorkspaceSettingsRecord>;
}

export interface AuditRepository {
  append(event: AuditEventRecord): Promise<AuditEventRecord>;
  listRecentForWorkspace(workspaceId: string, limit?: number): Promise<AuditEventRecord[]>;
  listRecentForLaunch(workspaceId: string, launchId: string, limit?: number): Promise<AuditEventRecord[]>;
}

interface WorkspaceSettingsRow {
  workspace_id: string;
  payload: WorkspaceSettingsRecord;
}

interface AuditEventRow {
  id: string;
  workspace_id: string;
  payload: AuditEventRecord;
}

export class MemoryWorkspaceAdminRepository implements WorkspaceSettingsRepository, AuditRepository {
  private settingsByWorkspaceId = new Map<string, WorkspaceSettingsRecord>();
  private auditEvents: AuditEventRecord[] = [];

  async get(workspaceId: string): Promise<WorkspaceSettingsRecord | undefined> {
    return this.settingsByWorkspaceId.get(workspaceId);
  }

  async save(settings: WorkspaceSettingsRecord): Promise<WorkspaceSettingsRecord> {
    this.settingsByWorkspaceId.set(settings.workspaceId, settings);
    return settings;
  }

  async append(event: AuditEventRecord): Promise<AuditEventRecord> {
    this.auditEvents.push(event);
    return event;
  }

  async listRecentForWorkspace(workspaceId: string, limit = 10): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((event) => event.workspaceId === workspaceId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit);
  }

  async listRecentForLaunch(workspaceId: string, launchId: string, limit = 10): Promise<AuditEventRecord[]> {
    return this.auditEvents
      .filter((event) => event.workspaceId === workspaceId && event.launchId === launchId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, limit);
  }
}

export class PostgresWorkspaceAdminRepository implements WorkspaceSettingsRepository, AuditRepository {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async initialize(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS workspace_settings (
        workspace_id TEXT PRIMARY KEY,
        updated_by_user_id TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS audit_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        launch_id TEXT,
        actor_user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        payload JSONB NOT NULL
      );
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS audit_events_workspace_created_at
      ON audit_events (workspace_id, created_at DESC);
    `);
  }

  async get(workspaceId: string): Promise<WorkspaceSettingsRecord | undefined> {
    const result = await this.pool.query<WorkspaceSettingsRow>(
      `
        SELECT workspace_id, payload
        FROM workspace_settings
        WHERE workspace_id = $1
        LIMIT 1;
      `,
      [workspaceId]
    );

    return result.rows[0]?.payload;
  }

  async save(settings: WorkspaceSettingsRecord): Promise<WorkspaceSettingsRecord> {
    const result = await this.pool.query<WorkspaceSettingsRow>(
      `
        INSERT INTO workspace_settings (
          workspace_id,
          updated_by_user_id,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT (workspace_id)
        DO UPDATE SET
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at,
          payload = EXCLUDED.payload
        RETURNING workspace_id, payload;
      `,
      [
        settings.workspaceId,
        settings.updatedByUserId,
        settings.updatedAt,
        JSON.stringify(settings)
      ]
    );

    return result.rows[0]?.payload ?? settings;
  }

  async append(event: AuditEventRecord): Promise<AuditEventRecord> {
    const result = await this.pool.query<AuditEventRow>(
      `
        INSERT INTO audit_events (
          id,
          workspace_id,
          event_type,
          launch_id,
          actor_user_id,
          created_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
        RETURNING id, workspace_id, payload;
      `,
      [
        event.id,
        event.workspaceId,
        event.eventType,
        event.launchId ?? null,
        event.actorUserId,
        event.createdAt,
        JSON.stringify(event)
      ]
    );

    return result.rows[0]?.payload ?? event;
  }

  async listRecentForWorkspace(workspaceId: string, limit = 10): Promise<AuditEventRecord[]> {
    const result = await this.pool.query<AuditEventRow>(
      `
        SELECT id, workspace_id, payload
        FROM audit_events
        WHERE workspace_id = $1
        ORDER BY created_at DESC
        LIMIT $2;
      `,
      [workspaceId, limit]
    );

    return result.rows.map((row) => row.payload);
  }

  async listRecentForLaunch(workspaceId: string, launchId: string, limit = 10): Promise<AuditEventRecord[]> {
    const result = await this.pool.query<AuditEventRow>(
      `
        SELECT id, workspace_id, payload
        FROM audit_events
        WHERE workspace_id = $1 AND launch_id = $2
        ORDER BY created_at DESC
        LIMIT $3;
      `,
      [workspaceId, launchId, limit]
    );

    return result.rows.map((row) => row.payload);
  }
}
