import test from "node:test";
import assert from "node:assert/strict";
import type { WebClient } from "@slack/web-api";
import { LaunchService } from "../src/services/launchService.ts";
import { MemoryLaunchRepository } from "../src/repositories/memoryLaunchRepository.ts";
import { DeterministicSummaryProvider } from "../src/services/llmProvider.ts";
import type { CanvasGateway, SearchSource, ThreadSource } from "../src/services/slackSources.ts";
import type { SearchEvidenceRecord, SlackMessageRecord } from "../src/domain/types.ts";

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
  private readonly evidence: SearchEvidenceRecord[];

  constructor(evidence: SearchEvidenceRecord[]) {
    this.evidence = evidence;
  }

  async searchPublicContext(): Promise<SearchEvidenceRecord[]> {
    return this.evidence;
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

test("analyzeThread persists a launch and resolveLaunchForDmQuery finds it from context", async () => {
  const repository = new MemoryLaunchRepository();
  const launchService = new LaunchService({
    repository,
    threadSource: new FakeThreadSource([
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
    ]),
    searchSource: new FakeSearchSource([]),
    canvasGateway: new FakeCanvasGateway(),
    summaryProvider: new DeterministicSummaryProvider()
  });

  const launch = await launchService.analyzeThread({} as WebClient, {
    workspaceId: "T123",
    sourceChannelId: "C123",
    sourceThreadTs: "1000.0001",
    userId: "U123"
  });

  assert.equal(launch.canvasId, "F123CANVAS");

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
