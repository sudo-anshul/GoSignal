import test from "node:test";
import assert from "node:assert/strict";
import { buildLaunchCanvasMarkdown } from "../src/ui/canvas.ts";
import { evaluateLaunchReadiness } from "../src/domain/readiness.ts";

test("renders key launch sections into markdown canvas output", () => {
  const launch = evaluateLaunchReadiness({
    key: {
      workspaceId: "T123",
      sourceChannelId: "C123",
      sourceThreadTs: "1000.0001"
    },
    name: "Checkout release",
    createdByUserId: "U123",
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
    searchEvidence: [],
    now: new Date("2026-07-09T12:00:00Z")
  });

  const markdown = buildLaunchCanvasMarkdown(launch);
  assert.match(markdown, /# Launch brief: Checkout release/);
  assert.match(markdown, /## Status by area/);
  assert.match(markdown, /## Required approvals/);
  assert.match(markdown, /## Evidence/);
});
