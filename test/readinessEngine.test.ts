import test from "node:test";
import assert from "node:assert/strict";
import { deriveLaunchName, evaluateLaunchReadiness } from "../src/domain/readiness.ts";
import type { LaunchKey, SearchEvidenceRecord, SlackMessageRecord } from "../src/domain/types.ts";

const key: LaunchKey = {
  workspaceId: "T123",
  sourceChannelId: "C123",
  sourceThreadTs: "1000.0001"
};

function evaluate(messages: SlackMessageRecord[], searchEvidence: SearchEvidenceRecord[] = []) {
  return evaluateLaunchReadiness({
    key,
    name: "Mobile v3 launch",
    createdByUserId: "U123",
    threadMessages: messages,
    searchEvidence,
    now: new Date("2026-07-09T12:00:00Z")
  });
}

test("marks launch red when rollback is missing and regressions remain", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "Ops says we can deploy tonight but I still haven't posted the rollback plan. <@UOPS>",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "QA still has two unresolved regressions, so this is a blocker for launch.",
      createdAt: "2026-07-09T09:10:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "red");
  assert.ok(launch.blockers.some((blocker) => blocker.title === "Rollback plan missing"));
});

test("marks launch yellow when one explicit sign-off is missing", () => {
  const launch = evaluate([
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
      text: "Support readiness is still missing sign-off for this launch.",
      createdAt: "2026-07-09T09:03:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "yellow");
  assert.equal(launch.approvals.find((approval) => approval.roleName === "support readiness")?.state, "missing");
});

test("marks launch needs_review when evidence is ambiguous", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "QA says this is mostly fine and should be okay.",
      createdAt: "2026-07-09T09:00:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "needs_review");
});

test("marks launch green when all required sign-offs are present", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "PM: Launch: Mobile v3 checkout rollout",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "Engineering lead approved for launch. <@UENG>",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:03:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0005",
      text: "Support readiness approved for launch. <@USUP>",
      createdAt: "2026-07-09T09:04:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "green");
  assert.equal(launch.decision.recommendation, "Ready to launch.");
  assert.match(launch.decision.summary, /is green with/i);
});

test("later support approval clears an earlier waiting-on-approval note", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "PM: Launch: Mobile v3 checkout rollout",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "Engineering lead approved for launch. <@UENG>",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:03:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0005",
      text: "PM: Waiting on support readiness approval.",
      createdAt: "2026-07-09T09:04:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0006",
      text: "Support readiness approved for launch. <@USUP>",
      createdAt: "2026-07-09T09:05:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "green");
  assert.equal(launch.categories.find((category) => category.name === "Approvals")?.state, "green");
  assert.equal(launch.categories.find((category) => category.name === "Dependencies")?.state, "green");
});

test("deriveLaunchName prefers an explicit launch line over the root message", () => {
  const name = deriveLaunchName([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "PM LemonTree",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "PM: Launch: Mobile v3 checkout rollout\nPM: Target: Today 5:00 PM IST",
      createdAt: "2026-07-09T09:01:00Z"
    }
  ]);

  assert.equal(name, "Mobile v3 checkout rollout");
});

test("keeps the summary yellow when a dependency risk remains after approvals", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "PM: Launch: Mobile v3 checkout rollout",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "Engineering lead approved for launch. <@UENG>",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:03:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0005",
      text: "Support readiness approved for launch. <@USUP>",
      createdAt: "2026-07-09T09:04:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0006",
      text: "PM: Vendor confirmation is still pending for launch.",
      createdAt: "2026-07-09T09:05:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "yellow");
  assert.equal(launch.decision.recommendation, "Proceed with caution.");
  assert.match(launch.decision.summary, /is yellow with/i);
});

test("ignores prior GoSignal replies when re-analyzing a thread", () => {
  const launch = evaluate([
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0001",
      text: "PM LemonTree",
      createdAt: "2026-07-09T09:00:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0002",
      text: "PM: Launch: Mobile v3 checkout rollout\nPM: Please confirm launch readiness.",
      createdAt: "2026-07-09T09:01:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0003",
      text: "Engineering lead approved for launch. <@UENG>",
      createdAt: "2026-07-09T09:02:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0004",
      text: "QA lead signed off. <@UQA>",
      createdAt: "2026-07-09T09:03:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0005",
      text: "Ops lead approved and rollback documented. <@UOPS>",
      createdAt: "2026-07-09T09:04:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0006",
      text: "Support readiness approved for launch. <@USUP>",
      createdAt: "2026-07-09T09:05:00Z"
    },
    {
      channelId: "C123",
      threadTs: "1000.0001",
      messageTs: "1000.0007",
      isBotMessage: true,
      text: "GoSignal readiness: PM LemonTree\nState: red\nTop blocker: Blocking issue detected\nPM LemonTree is yellow. PM LemonTree is green with low confidence based on explicit approvals and no open blockers.",
      createdAt: "2026-07-09T09:06:00Z"
    }
  ]);

  assert.equal(launch.decision.overallState, "green");
  assert.equal(launch.blockers.length, 0);
});
