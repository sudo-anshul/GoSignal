import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchCanvasMarkdown } from "../src/ui/canvas.ts";
import { evaluateLaunchReadiness } from "../src/domain/readiness.ts";

test("renders evidence usage and live search diagnostics into canvas markdown", () => {
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
        createdAt: "2026-07-09T09:00:00Z",
        permalink: "https://example.com/eng"
      }
    ],
    searchEvidence: [
      {
        id: "search-1",
        sourceType: "search_message",
        title: "Support blocker",
        text: "Support readiness is still missing sign-off for this launch.",
        channelId: "C444",
        channelName: "support-readiness",
        permalink: "https://example.com/support",
        createdAt: "2026-07-09T11:30:00Z"
      }
    ],
    now: new Date("2026-07-09T12:00:00Z")
  });

  launch.searchQuery = "Find public Slack evidence for Checkout release";
  launch.searchDiagnostics = {
    status: "used",
    note: "Live search added public evidence from outside the current thread.",
    resultCount: 1,
    messageCount: 1,
    fileCount: 0,
    channelCount: 0
  };

  const markdown = buildLaunchCanvasMarkdown(launch);
  assert.match(markdown, /# Launch brief: Checkout release/);
  assert.match(markdown, /## Status by area/);
  assert.match(markdown, /## Evidence used/);
  assert.match(markdown, /## Live search diagnostics/);
  assert.match(markdown, /## Live search receipts/);
  assert.match(markdown, /support-readiness/);
  assert.match(markdown, /## Evidence/);
});
