import test from "node:test";
import assert from "node:assert/strict";
import { buildAppHomeView, buildWorkspaceSettingsModal } from "../src/ui/appHome.ts";
import { evaluateLaunchReadiness } from "../src/domain/readiness.ts";
import type { AuditEventRecord, WorkspaceSettingsRecord } from "../src/domain/types.ts";

function sampleLaunch() {
  const launch = evaluateLaunchReadiness({
    key: {
      workspaceId: "T123",
      sourceChannelId: "C123",
      sourceThreadTs: "1000.0001"
    },
    name: "Checkout release",
    createdByUserId: "U123",
    launchProfile: "saas_release",
    threadMessages: [
      {
        channelId: "C123",
        threadTs: "1000.0001",
        messageTs: "1000.0001",
        text: "Engineering lead approved. <@UENG>",
        createdAt: "2026-07-09T09:00:00Z"
      }
    ],
    searchEvidence: [],
    now: new Date("2026-07-11T12:00:00Z")
  });

  launch.searchDiagnostics = {
    status: "empty",
    note: "Live search ran but found no extra evidence.",
    resultCount: 0,
    messageCount: 0,
    fileCount: 0,
    channelCount: 0
  };

  return launch;
}

const settings: WorkspaceSettingsRecord = {
  workspaceId: "T123",
  searchMode: "public_only",
  auditRetentionDays: 30,
  defaultLaunchProfile: "saas_release",
  updatedByUserId: "UADMIN",
  createdAt: "2026-07-11T11:00:00Z",
  updatedAt: "2026-07-11T12:00:00Z"
};

const auditEvents: AuditEventRecord[] = [
  {
    id: "audit-1",
    workspaceId: "T123",
    actorUserId: "UADMIN",
    eventType: "workspace_settings_updated",
    summary: "Workspace settings updated: thread + live public search mode, 30-day audit retention.",
    createdAt: "2026-07-11T12:00:00Z"
  }
];

test("buildAppHomeView includes workspace controls and recent audit events", () => {
  const view = buildAppHomeView({
    launches: [sampleLaunch()],
    settings,
    auditEvents,
    responseMode: "deterministic (LLM summaries disabled)"
  });

  const blocks = (view as { blocks?: Array<{ type?: string; text?: { text?: string }; fields?: Array<{ text?: string }> }> }).blocks ?? [];
  assert.ok(blocks.some((block) => block.text?.text?.includes("Recent Audit Events")));
  assert.ok(blocks.some((block) => block.fields?.some((field) => field.text?.includes("Live search mode"))));
  assert.ok(blocks.some((block) => block.fields?.some((field) => field.text?.includes("Audit retention"))));
  assert.ok(blocks.some((block) => block.fields?.some((field) => field.text?.includes("Default profile"))));
});

test("buildWorkspaceSettingsModal preloads the current workspace settings", () => {
  const modal = buildWorkspaceSettingsModal(settings);
  const blocks = (modal as { blocks?: Array<{ block_id?: string; element?: { initial_value?: string } }> }).blocks ?? [];
  const retentionInput = blocks.find((block) => block.block_id === "audit_retention_days");

  assert.equal((modal as { private_metadata?: string }).private_metadata, "T123");
  assert.equal(retentionInput?.element?.initial_value, "30");
});
