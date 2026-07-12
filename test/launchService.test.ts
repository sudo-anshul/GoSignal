import test from "node:test";
import assert from "node:assert/strict";
import type { WebClient } from "@slack/web-api";
import { LaunchService } from "../src/services/launchService.ts";
import { MemoryLaunchRepository } from "../src/repositories/memoryLaunchRepository.ts";
import { DeterministicSummaryProvider } from "../src/services/llmProvider.ts";
import type { CanvasGateway, SearchSource, ThreadSource } from "../src/services/slackSources.ts";
import type { SearchContextResult, SearchEvidenceRecord, SearchRequest, SlackMessageRecord } from "../src/domain/types.ts";
import { MemoryWorkspaceAdminRepository } from "../src/repositories/workspaceAdminRepository.ts";
import { WorkspaceAdminService } from "../src/services/workspaceAdminService.ts";

class FakeThreadSource implements ThreadSource {
  private readonly messages: SlackMessageRecord[];

  constructor(messages: SlackMessageRecord[]) {
    this.messages = messages;
  }

  async fetchThread(): Promise<SlackMessageRecord[]> {
    return this.messages;
  }
}

class FakeSearchSource implements SearchSource {
  readonly requests: SearchRequest[] = [];
  private readonly evidence: SearchEvidenceRecord[];

  constructor(evidence: SearchEvidenceRecord[]) {
    this.evidence = evidence;
  }

  async searchPublicContext(_client: WebClient, request: SearchRequest): Promise<SearchContextResult> {
    this.requests.push(request);

    return {
      evidence: this.evidence,
      diagnostics: {
        status: this.evidence.length > 0 ? "used" : request.actionToken ? "empty" : "unavailable",
        note: this.evidence.length > 0
          ? "Live search added public evidence."
          : request.actionToken
            ? "Live search ran but found no extra evidence."
            : "Live search unavailable because no action token was provided.",
        resultCount: this.evidence.length,
        messageCount: this.evidence.filter((item) => item.sourceType === "search_message").length,
        fileCount: this.evidence.filter((item) => item.sourceType === "search_file").length,
        channelCount: this.evidence.filter((item) => item.sourceType === "search_channel").length
      }
    };
  }
}

class FakeCanvasGateway implements CanvasGateway {
  async createOrUpdate(): Promise<{ canvasId: string; label: string }> {
    return {
      canvasId: "F123CANVAS",
      label: "canvas:F123CANVAS"
    };
  }
}

function createThreadMessages(): SlackMessageRecord[] {
  return [
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "Engineering lead approved. <@UENG>",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "Support readiness approved. <@USUP>",
      createdAt: "2026-07-09T09:03:00Z"
    }
  ];
}

function createThreadMessagesMissingSupport(): SlackMessageRecord[] {
  return [
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "Engineering lead approved. <@UENG>",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "Release notes ready and shared for the launch.",
      createdAt: "2026-07-09T09:03:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0005",
      text: "Primary on call owner is <@UONCALL> for this release.",
      createdAt: "2026-07-09T09:04:00Z"
    }
  ];
}

function createWorkspaceAdminService(): WorkspaceAdminService {
  const repository = new MemoryWorkspaceAdminRepository();
  return new WorkspaceAdminService({
    settingsRepository: repository,
    auditRepository: repository,
    now: () => new Date("2026-07-11T12:00:00Z")
  });
}

test("analyzeThread persists a launch, stores search diagnostics, and resolves it from context", async () => {
  const repository = new MemoryLaunchRepository();
  const workspaceAdminService = createWorkspaceAdminService();
  const searchSource = new FakeSearchSource([]);
  const launchService = new LaunchService({
    repository,
    threadSource: new FakeThreadSource(createThreadMessages()),
    searchSource,
    canvasGateway: new FakeCanvasGateway(),
    summaryProvider: new DeterministicSummaryProvider(),
    workspaceAdminService
  });

  const launch = await launchService.analyzeThread({} as WebClient, {
    workspaceId: "T123",
    sourceChannelId: "C123",
    sourceThreadTs: "1000.0001",
    userId: "U123",
    actionToken: "search-token"
  });

  assert.equal(launch.canvasId, "F123CANVAS");
  assert.equal(launch.searchDiagnostics?.status, "empty");
  assert.equal(searchSource.requests[0]?.actionToken, "search-token");

  const auditEvents = await workspaceAdminService.listRecentAuditEvents("T123");
  assert.equal(auditEvents[0]?.eventType, "launch_analyzed");

  const resolved = await launchService.resolveLaunchForDmQuery({
    workspaceId: "T123",
    userId: "U123",
    query: "Can we launch now?",
    context: {
      workspaceId: "T123",
      userId: "U123",
      channelId: "C123",
      threadTs: "1000.0001",
      seenAt: "2026-07-09T12:00:00Z"
    }
  });

  assert.ok(resolved);
  assert.equal(resolved?.id, launch.id);
});

test("rerunLaunch preserves the latest action token for live search", async () => {
  const repository = new MemoryLaunchRepository();
  const searchSource = new FakeSearchSource([]);
  const launchService = new LaunchService({
    repository,
    threadSource: new FakeThreadSource(createThreadMessages()),
    searchSource,
    canvasGateway: new FakeCanvasGateway(),
    summaryProvider: new DeterministicSummaryProvider(),
    workspaceAdminService: createWorkspaceAdminService()
  });

  const launch = await launchService.analyzeThread({} as WebClient, {
    workspaceId: "T123",
    sourceChannelId: "C123",
    sourceThreadTs: "1000.0001",
    userId: "U123"
  });

  await launchService.rerunLaunch({} as WebClient, launch.id, "rerun-action-token");

  assert.equal(searchSource.requests.at(-1)?.actionToken, "rerun-action-token");
});

test("thread-only workspace settings disable live search and record that choice", async () => {
  const repository = new MemoryLaunchRepository();
  const workspaceAdminService = createWorkspaceAdminService();
  await workspaceAdminService.updateSettings({
    workspaceId: "T123",
    updatedByUserId: "UADMIN",
    searchMode: "thread_only",
    auditRetentionDays: 14,
    defaultLaunchProfile: "saas_release"
  });

  const searchSource = new FakeSearchSource([
    {
      id: "search-1",
      sourceType: "search_message",
      title: "Would have been found",
      text: "A cross-channel blocker exists.",
      createdAt: "2026-07-11T11:00:00Z"
    }
  ]);

  const launchService = new LaunchService({
    repository,
    threadSource: new FakeThreadSource(createThreadMessages()),
    searchSource,
    canvasGateway: new FakeCanvasGateway(),
    summaryProvider: new DeterministicSummaryProvider(),
    workspaceAdminService
  });

  const launch = await launchService.analyzeThread({} as WebClient, {
    workspaceId: "T123",
    sourceChannelId: "C123",
    sourceThreadTs: "1000.0001",
    userId: "U123",
    actionToken: "search-token"
  });

  assert.equal(searchSource.requests.length, 0);
  assert.equal(launch.searchDiagnostics?.status, "unavailable");
  assert.match(launch.searchDiagnostics?.note ?? "", /disabled for this workspace/i);
  assert.equal(launch.evidence.every((item) => item.sourceType === "thread_message"), true);
});

test("assignOwner stores an accountable follow-up and export/history include it", async () => {
  const repository = new MemoryLaunchRepository();
  const workspaceAdminService = createWorkspaceAdminService();
  const launchService = new LaunchService({
    repository,
    threadSource: new FakeThreadSource(createThreadMessagesMissingSupport()),
    searchSource: new FakeSearchSource([]),
    canvasGateway: new FakeCanvasGateway(),
    summaryProvider: new DeterministicSummaryProvider(),
    workspaceAdminService
  });

  const launch = await launchService.analyzeThread({} as WebClient, {
    workspaceId: "T123",
    sourceChannelId: "C123",
    sourceThreadTs: "1000.0001",
    userId: "U123",
    actionToken: "search-token"
  });

  const updatedLaunch = await launchService.assignOwner(
    {} as WebClient,
    launch.id,
    "support readiness",
    "UOWNER",
    "UADMIN"
  );

  assert.equal(updatedLaunch?.ownerAssignments[0]?.userId, "UOWNER");
  assert.equal(updatedLaunch?.ownerAssignments[0]?.roleName, "support readiness");

  const history = await launchService.getLaunchHistory(launch.id);
  assert.ok(history?.events.some((event) => event.eventType === "owner_assigned"));

  const exportPayload = await launchService.buildLaunchExport(launch.id);
  assert.match(exportPayload?.markdown ?? "", /## Owner assignments/);
  assert.match(exportPayload?.markdown ?? "", /support readiness/i);
});
