import test from "node:test";
import assert from "node:assert/strict";
import { MemoryWorkspaceAdminRepository } from "../src/repositories/workspaceAdminRepository.ts";
import { WorkspaceAdminService } from "../src/services/workspaceAdminService.ts";

test("workspace admin service returns defaults and records settings updates in the audit ledger", async () => {
  const repository = new MemoryWorkspaceAdminRepository();
  let now = new Date("2026-07-11T12:00:00Z");
  const service = new WorkspaceAdminService({
    settingsRepository: repository,
    auditRepository: repository,
    now: () => now
  });

  const defaults = await service.getSettings("T123", "UADMIN");
  assert.equal(defaults.searchMode, "public_only");
  assert.equal(defaults.auditRetentionDays, 30);
  assert.equal(defaults.defaultLaunchProfile, "saas_release");

  now = new Date("2026-07-11T12:05:00Z");
  const updated = await service.updateSettings({
    workspaceId: "T123",
    updatedByUserId: "UADMIN",
    searchMode: "thread_only",
    auditRetentionDays: 14,
    defaultLaunchProfile: "mobile_release"
  });

  assert.equal(updated.searchMode, "thread_only");
  assert.equal(updated.auditRetentionDays, 14);
  assert.equal(updated.defaultLaunchProfile, "mobile_release");

  const auditEvents = await service.listRecentAuditEvents("T123", 5);
  assert.equal(auditEvents[0]?.eventType, "workspace_settings_updated");
  assert.match(auditEvents[0]?.summary ?? "", /Mobile release default profile/i);
  assert.match(auditEvents[0]?.summary ?? "", /14-day audit retention/i);
});

test("audit listing respects the workspace retention window", async () => {
  const repository = new MemoryWorkspaceAdminRepository();
  let now = new Date("2026-07-11T12:00:00Z");
  const service = new WorkspaceAdminService({
    settingsRepository: repository,
    auditRepository: repository,
    now: () => now
  });

  await service.updateSettings({
    workspaceId: "T123",
    updatedByUserId: "UADMIN",
    searchMode: "public_only",
    auditRetentionDays: 7,
    defaultLaunchProfile: "saas_release"
  });

  await service.recordEvent({
    workspaceId: "T123",
    actorUserId: "U123",
    eventType: "launch_analyzed",
    summary: "Fresh event"
  });

  now = new Date("2026-07-20T12:00:00Z");
  await service.recordEvent({
    workspaceId: "T123",
    actorUserId: "U123",
    eventType: "launch_rerun",
    summary: "Recent event"
  });

  const events = await service.listRecentAuditEvents("T123", 10);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.eventType, "launch_rerun");
});
