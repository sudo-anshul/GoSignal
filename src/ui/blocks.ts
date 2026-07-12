import { buildApprovalReplyExample, LAUNCH_PROFILE_DEFINITIONS, titleCaseRole } from "../domain/constants.ts";
import type { EvidenceItem, EvidenceSourceType, LaunchRecord, ReadinessState, SearchEvidenceStatus } from "../domain/types.ts";

type SlackBlock = Record<string, unknown>;

function stateEmoji(state: ReadinessState): string {
  switch (state) {
    case "green":
      return ":large_green_circle:";
    case "yellow":
      return ":large_yellow_circle:";
    case "red":
      return ":red_circle:";
    case "needs_review":
      return ":white_circle:";
  }
}

function stateLabel(state: ReadinessState): string {
  return `${stateEmoji(state)} ${state.replace("_", " ")}`;
}

function searchStatusLabel(status: SearchEvidenceStatus | undefined): string {
  switch (status) {
    case "used":
      return "Used";
    case "empty":
      return "No extra results";
    case "unavailable":
      return "Unavailable";
    default:
      return "Not captured";
  }
}

function requirementStateLabel(state: LaunchRecord["requirementChecks"][number]["state"]): string {
  switch (state) {
    case "met":
      return ":white_check_mark: met";
    case "missing":
      return ":warning: missing";
    case "needs_review":
      return ":white_circle: needs review";
  }
}

function sourceLabel(sourceType: EvidenceSourceType): string {
  switch (sourceType) {
    case "thread_message":
      return "thread";
    case "search_message":
      return "live search";
    case "search_file":
      return "file";
    case "search_channel":
      return "channel";
  }
}

function channelLabel(item: Pick<EvidenceItem, "sourceType" | "channelId" | "channelName">): string {
  if (item.channelName) {
    return `#${item.channelName}`;
  }
  if (item.sourceType === "thread_message") {
    return "current thread";
  }
  if (item.channelId) {
    return item.channelId;
  }
  return "channel unknown";
}

function ageLabel(createdAt: string | undefined, referenceAt: string): string {
  if (!createdAt) {
    return "age unknown";
  }

  const createdTime = Date.parse(createdAt);
  const referenceTime = Date.parse(referenceAt);
  if (Number.isNaN(createdTime) || Number.isNaN(referenceTime)) {
    return "age unknown";
  }

  const ageMinutes = Math.max(Math.floor((referenceTime - createdTime) / 60_000), 0);
  if (ageMinutes < 60) {
    return `${Math.max(ageMinutes, 1)}m old`;
  }

  const ageHours = Math.floor(ageMinutes / 60);
  if (ageHours < 48) {
    return `${ageHours}h old`;
  }

  return `${Math.floor(ageHours / 24)}d old`;
}

function truncate(text: string, limit: number): string {
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3).trimEnd()}...`;
}

function evidenceLink(item: EvidenceItem): string {
  if (!item.permalink) {
    return item.title;
  }
  return `<${item.permalink}|${item.title}>`;
}

function evidenceMetadata(item: EvidenceItem, referenceAt: string): string {
  return `${sourceLabel(item.sourceType)} | ${item.freshness} | ${channelLabel(item)} | ${ageLabel(item.createdAt, referenceAt)}`;
}

function formatEvidenceReceipt(item: EvidenceItem, referenceAt: string): string {
  return `• ${evidenceLink(item)} - ${evidenceMetadata(item, referenceAt)} - ${truncate(item.summary, 110)}`;
}

function collectEvidenceCounts(launch: LaunchRecord): {
  threadCount: number;
  searchMessageCount: number;
  fileCount: number;
  channelCount: number;
} {
  return launch.evidence.reduce(
    (counts, item) => {
      switch (item.sourceType) {
        case "thread_message":
          counts.threadCount += 1;
          break;
        case "search_message":
          counts.searchMessageCount += 1;
          break;
        case "search_file":
          counts.fileCount += 1;
          break;
        case "search_channel":
          counts.channelCount += 1;
          break;
      }
      return counts;
    },
    {
      threadCount: 0,
      searchMessageCount: 0,
      fileCount: 0,
      channelCount: 0
    }
  );
}

function button(actionId: string, text: string, value: string, style?: "primary" | "danger"): SlackBlock {
  return {
    type: "button",
    action_id: actionId,
    text: {
      type: "plain_text",
      text
    },
    value,
    ...(style ? { style } : {})
  };
}

function encodeActionValue(payload: Record<string, string>): string {
  return JSON.stringify(payload);
}

export function buildLaunchBlocks(launch: LaunchRecord, responseText = launch.decision.summary): SlackBlock[] {
  const topBlocker = launch.blockers.find((blocker) => blocker.status === "open");
  const missingApproval = launch.approvals.find((approval) => approval.state !== "approved");
  const missingApprovalOwner = missingApproval
    ? launch.ownerAssignments.find((assignment) => assignment.roleName === missingApproval.roleName)
    : undefined;
  const nonMetRequirements = launch.requirementChecks.filter((requirement) => requirement.state !== "met");
  const evidenceCounts = collectEvidenceCounts(launch);
  const searchReceipts = launch.evidence.filter((item) => item.sourceType !== "thread_message").slice(0, 3);
  const evidenceById = new Map(launch.evidence.map((item) => [item.id, item]));
  const topBlockerEvidence = topBlocker ? evidenceById.get(topBlocker.evidenceIds[0] ?? "") : undefined;
  const missingApprovalEvidence = missingApproval ? evidenceById.get(missingApproval.evidenceIds[0] ?? "") : undefined;
  const primaryActions: SlackBlock[] = [
    button("gosignal_rerun", "Re-run readiness", launch.id, "primary"),
    ...(missingApproval ? [button("gosignal_request_signoff", "Request sign-off", launch.id)] : []),
    button("gosignal_open_canvas", "Open launch brief", launch.id),
    ...(missingApproval ? [button("gosignal_assign_owner", "Assign owner", launch.id)] : []),
    button("gosignal_view_history", "View history", launch.id)
  ].slice(0, 5);
  const secondaryActions: SlackBlock[] = [
    button("gosignal_export_brief", "Export brief", launch.id),
    ...(missingApprovalOwner
      ? [
          button(
            "gosignal_remind_owner",
            "Remind owner",
            encodeActionValue({
              launchId: launch.id,
              roleName: missingApprovalOwner.roleName
            })
          )
        ]
      : [])
  ];

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: `GoSignal readiness: ${launch.name}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Updated ${new Date(launch.updatedAt).toLocaleString()}`
        },
        {
          type: "mrkdwn",
          text: `State: *${launch.decision.overallState}*`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Recommendation:* ${launch.decision.recommendation}\n*Summary:* ${responseText}\n*Next action:* ${launch.decision.nextAction}`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Launch profile*\n${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}`
        },
        {
          type: "mrkdwn",
          text: `*Workflow status*\n${launch.status}`
        },
        {
          type: "mrkdwn",
          text: `*Confidence*\n${launch.decision.confidence}`
        },
        {
          type: "mrkdwn",
          text: `*Live search*\n${searchStatusLabel(launch.searchDiagnostics?.status)}`
        }
      ]
    },
    {
      type: "section",
      fields: launch.categories.map((category) => ({
        type: "mrkdwn",
        text: `*${category.name}*\n${stateLabel(category.state)}`
      }))
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Profile checks*\n${
            launch.requirementChecks.length > 0
              ? launch.requirementChecks
                  .map(
                    (requirement) =>
                      `• ${requirement.label} — ${requirementStateLabel(requirement.state)} · ${requirement.reason}`
                  )
                  .join("\n")
              : "No profile-specific evidence checks were recorded."
          }`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Thread evidence*\n${evidenceCounts.threadCount}`
        },
        {
          type: "mrkdwn",
          text: `*Live search messages*\n${evidenceCounts.searchMessageCount}`
        },
        {
          type: "mrkdwn",
          text: `*File evidence*\n${evidenceCounts.fileCount}`
        },
        {
          type: "mrkdwn",
          text: `*Channel evidence*\n${evidenceCounts.channelCount}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*Live search diagnostics*\n` +
          `Status: *${searchStatusLabel(launch.searchDiagnostics?.status)}*\n` +
          `${launch.searchDiagnostics?.note ?? "GoSignal did not capture live search diagnostics for this run."}` +
          (launch.searchQuery ? `\n_Query:_ \`${launch.searchQuery}\`` : "")
      }
    },
    ...(searchReceipts.length > 0
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Live search receipts*\n${searchReceipts.map((item) => formatEvidenceReceipt(item, launch.updatedAt)).join("\n")}`
            }
          } satisfies SlackBlock
        ]
      : []),
    ...(topBlocker
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Top blocker:* ${topBlocker.title}\n${topBlocker.description}` +
                (topBlockerEvidence ? `\n_Evidence:_ ${evidenceMetadata(topBlockerEvidence, launch.updatedAt)}` : "")
            }
          } satisfies SlackBlock
        ]
      : []),
    ...(missingApproval
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Missing sign-off:* ${missingApproval.roleName}\n${missingApproval.reason}` +
                (missingApprovalEvidence ? `\n_Evidence:_ ${evidenceMetadata(missingApprovalEvidence, launch.updatedAt)}` : "") +
                (missingApprovalOwner
                  ? `\n*Assigned owner:* <@${missingApprovalOwner.userId}> · reminders sent: ${missingApprovalOwner.reminderCount}`
                  : "") +
                `\n*Reply template:* \`${buildApprovalReplyExample(missingApproval.roleName)}\``
            }
          } satisfies SlackBlock
        ]
      : []),
    ...(launch.ownerAssignments.length > 0
      ? [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text:
                `*Owner assignments*\n` +
                launch.ownerAssignments
                  .map(
                    (assignment) =>
                      `• ${titleCaseRole(assignment.roleName)} → <@${assignment.userId}> ` +
                      `(assigned by <@${assignment.assignedByUserId}>, reminders ${assignment.reminderCount})`
                  )
                  .join("\n")
            }
          } satisfies SlackBlock
        ]
      : []),
    {
      type: "actions",
      elements: primaryActions
    },
    ...(secondaryActions.length > 0
      ? [
          {
            type: "actions",
            elements: secondaryActions
          } satisfies SlackBlock
        ]
      : [])
  ];
}

export function buildLaunchBlocksWithResponse(launch: LaunchRecord, responseText: string): SlackBlock[] {
  return buildLaunchBlocks(launch, responseText);
}

export function buildDmReplyBlocks(launch: LaunchRecord, responseText = launch.decision.summary): SlackBlock[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `Here is the latest GoSignal view for *${launch.name}*.\n${responseText}`
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*State*\n${stateLabel(launch.decision.overallState)}`
        },
        {
          type: "mrkdwn",
          text: `*Confidence*\n${launch.decision.confidence}`
        },
        {
          type: "mrkdwn",
          text: `*Profile*\n${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}`
        },
        {
          type: "mrkdwn",
          text: `*Live search*\n${searchStatusLabel(launch.searchDiagnostics?.status)}`
        }
      ]
    },
    {
      type: "actions",
      elements: [
        button("gosignal_rerun", "Re-run readiness", launch.id, "primary"),
        button("gosignal_open_canvas", "Open launch brief", launch.id)
      ]
    }
  ];
}

export function buildSignoffRequestText(launch: LaunchRecord): string {
  const missingApproval = launch.approvals.find((approval) => approval.state !== "approved");
  if (!missingApproval) {
    return `GoSignal could not find a missing sign-off for ${launch.name}.`;
  }

  const ownerAssignment = launch.ownerAssignments.find((assignment) => assignment.roleName === missingApproval.roleName);
  return (
    `GoSignal still needs *${missingApproval.roleName}* before recommending green for *${launch.name}*. ` +
    (ownerAssignment
      ? `Assigned owner: <@${ownerAssignment.userId}>. `
      : "") +
    `Please ask the owner to reply in this thread with a clear sign-off like: "${buildApprovalReplyExample(missingApproval.roleName)}"`
  );
}
