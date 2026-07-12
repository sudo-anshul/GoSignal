import test from "node:test";
import assert from "node:assert/strict";
import { evaluateLaunchReadiness } from "../src/domain/readiness.ts";
import { buildDmReplyBlocks, buildLaunchBlocksWithResponse, buildSignoffRequestText } from "../src/ui/blocks.ts";

const launch = (() => {
  const result = evaluateLaunchReadiness({
    key: {
      workspaceId: "T123",
      sourceChannelId: "C123",
      sourceThreadTs: "1000.0001"
    },
    name: "Mobile v3 launch",
    createdByUserId: "U123",
    launchProfile: "saas_release",
    threadMessages: [
      {
        channelId: "C123",
        threadTs: "1000.0001",
        messageTs: "1000.0001",
        text: "Ops lead approved and rollback documented. <@UOPS>",
        createdAt: "2026-07-09T09:00:00Z"
      }
    ],
    searchEvidence: [
      {
        id: "search-1",
        sourceType: "search_message",
        title: "Support escalation",
        text: "Support readiness is still missing sign-off for this launch.",
        channelId: "C555",
        channelName: "support-readiness",
        permalink: "https://example.com/search/1",
        createdAt: "2026-07-09T11:50:00Z"
      }
    ],
    now: new Date("2026-07-09T12:00:00Z")
  });

  result.searchQuery = "Find public Slack evidence for Mobile v3 launch";
  result.searchDiagnostics = {
    status: "used",
    note: "Live search added public evidence from outside the current thread.",
    resultCount: 1,
    messageCount: 1,
    fileCount: 0,
    channelCount: 0
  };

  return result;
})();

test("buildLaunchBlocks includes action buttons and live search receipts", () => {
  const blocks = buildLaunchBlocksWithResponse(launch, "Custom answer");
  const actions = blocks.find((block) => block.type === "actions");
  const liveSearchDiagnostics = blocks.find(
    (block) =>
      block.type === "section" &&
      typeof (block as { text?: { text?: string } }).text?.text === "string" &&
      (block as { text?: { text?: string } }).text?.text?.includes("Live search diagnostics")
  );
  const liveSearchReceipts = blocks.find(
    (block) =>
      block.type === "section" &&
      typeof (block as { text?: { text?: string } }).text?.text === "string" &&
      (block as { text?: { text?: string } }).text?.text?.includes("Live search receipts")
  );

  assert.ok(actions);
  assert.ok(liveSearchDiagnostics);
  assert.ok(liveSearchReceipts);
});

test("buildDmReplyBlocks includes summary text and live search status", () => {
  const blocks = buildDmReplyBlocks(launch, "Natural reply");
  const section = blocks.find((block) => block.type === "section");
  const fieldsSection = blocks.find(
    (block) => block.type === "section" && Array.isArray((block as { fields?: unknown[] }).fields)
  ) as { fields?: Array<{ text?: string }> } | undefined;

  assert.ok(section);
  assert.match(String((section as { text?: { text?: string } }).text?.text), /Natural reply/);
  assert.ok(fieldsSection?.fields?.some((field) => field.text?.includes("Live search")));
});

test("buildSignoffRequestText includes a concrete reply template", () => {
  const requestText = buildSignoffRequestText(launch);
  assert.match(requestText, /Engineering Lead approved for launch/);
});
