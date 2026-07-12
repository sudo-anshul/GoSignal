import { randomUUID } from "node:crypto";
import { DEFAULT_LAUNCH_PROFILE, LAUNCH_PROFILE_DEFINITIONS } from "../domain/constants.ts";
import type {
  AuditEventRecord,
  AuditEventType,
  LaunchProfileId,
  WorkspaceSearchMode,
  WorkspaceSettingsRecord
} from "../domain/types.ts";
import type { AuditRepository, WorkspaceSettingsRepository } from "../repositories/workspaceAdminRepository.ts";

interface WorkspaceAdminServiceDependencies {
  settingsRepository: WorkspaceSettingsRepository;
  auditRepository: AuditRepository;
  now?: () => Date;
}

export interface WorkspaceSettingsUpdateInput {
  workspaceId: string;
  updatedByUserId: string;
  searchMode: WorkspaceSearchMode;
  auditRetentionDays: number;
  defaultLaunchProfile: LaunchProfileId;
}

export interface AuditEventInput {
  workspaceId: string;
  actorUserId: string;
  eventType: AuditEventType;
  summary: string;
  launchId?: string;
  metadata?: Record<string, unknown>;
}

const DEFAULT_AUDIT_RETENTION_DAYS = 30;

export class WorkspaceAdminService {
  private readonly settingsRepository: WorkspaceSettingsRepository;
  private readonly auditRepository: AuditRepository;
  private readonly now: () => Date;

  constructor(dependencies: WorkspaceAdminServiceDependencies) {
    this.settingsRepository = dependencies.settingsRepository;
    this.auditRepository = dependencies.auditRepository;
    this.now = dependencies.now ?? (() => new Date());
  }

  async getSettings(workspaceId: string, fallbackUserId = "system"): Promise<WorkspaceSettingsRecord> {
    return (await this.settingsRepository.get(workspaceId)) ?? buildDefaultSettings(workspaceId, fallbackUserId, this.now());
  }

  async updateSettings(input: WorkspaceSettingsUpdateInput): Promise<WorkspaceSettingsRecord> {
    if (!Number.isInteger(input.auditRetentionDays) || input.auditRetentionDays < 1 || input.auditRetentionDays > 365) {
      throw new Error("Audit retention days must be an integer between 1 and 365.");
    }

    const now = this.now();
    const existing = await this.getSettings(input.workspaceId, input.updatedByUserId);
    const updatedSettings: WorkspaceSettingsRecord = {
      workspaceId: input.workspaceId,
      searchMode: input.searchMode,
      auditRetentionDays: input.auditRetentionDays,
      defaultLaunchProfile: input.defaultLaunchProfile,
      updatedByUserId: input.updatedByUserId,
      createdAt: existing.createdAt,
      updatedAt: now.toISOString()
    };

    const savedSettings = await this.settingsRepository.save(updatedSettings);
    try {
      await this.recordEvent({
        workspaceId: input.workspaceId,
        actorUserId: input.updatedByUserId,
        eventType: "workspace_settings_updated",
        summary:
          `Workspace settings updated: ${describeSearchMode(savedSettings.searchMode)} mode, ` +
          `${LAUNCH_PROFILE_DEFINITIONS[savedSettings.defaultLaunchProfile].label} default profile, ` +
          `${savedSettings.auditRetentionDays}-day audit retention.`,
        metadata: {
          previousSearchMode: existing.searchMode,
          searchMode: savedSettings.searchMode,
          previousAuditRetentionDays: existing.auditRetentionDays,
          auditRetentionDays: savedSettings.auditRetentionDays,
          previousDefaultLaunchProfile: existing.defaultLaunchProfile,
          defaultLaunchProfile: savedSettings.defaultLaunchProfile
        }
      });
    } catch (error) {
      console.warn("[GoSignal warning] Failed to write audit event for workspace settings update.", error);
    }

    return savedSettings;
  }

  async listRecentAuditEvents(workspaceId: string, limit = 5): Promise<AuditEventRecord[]> {
    const settings = await this.getSettings(workspaceId);
    const candidates = await this.auditRepository.listRecentForWorkspace(workspaceId, Math.max(limit * 5, limit));
    const cutoff = this.now().getTime() - settings.auditRetentionDays * 86_400_000;

    return candidates
      .filter((event) => {
        const timestamp = Date.parse(event.createdAt);
        return Number.isNaN(timestamp) ? true : timestamp >= cutoff;
      })
      .slice(0, limit);
  }

  async listRecentAuditEventsForLaunch(workspaceId: string, launchId: string, limit = 8): Promise<AuditEventRecord[]> {
    const settings = await this.getSettings(workspaceId);
    const candidates = await this.auditRepository.listRecentForLaunch(workspaceId, launchId, Math.max(limit * 5, limit));
    const cutoff = this.now().getTime() - settings.auditRetentionDays * 86_400_000;

    return candidates
      .filter((event) => {
        const timestamp = Date.parse(event.createdAt);
        return Number.isNaN(timestamp) ? true : timestamp >= cutoff;
      })
      .slice(0, limit);
  }

  async recordEvent(input: AuditEventInput): Promise<AuditEventRecord> {
    return this.auditRepository.append({
      id: `audit-${randomUUID()}`,
      workspaceId: input.workspaceId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      summary: input.summary,
      launchId: input.launchId,
      metadata: input.metadata,
      createdAt: this.now().toISOString()
    });
  }
}

export function describeSearchMode(searchMode: WorkspaceSearchMode): string {
  return searchMode === "thread_only" ? "thread-only" : "thread + live public search";
}

function buildDefaultSettings(workspaceId: string, updatedByUserId: string, now: Date): WorkspaceSettingsRecord {
  const timestamp = now.toISOString();
  return {
    workspaceId,
    searchMode: "public_only",
    auditRetentionDays: DEFAULT_AUDIT_RETENTION_DAYS,
    defaultLaunchProfile: DEFAULT_LAUNCH_PROFILE,
    updatedByUserId,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}
