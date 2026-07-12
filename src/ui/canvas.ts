import { LAUNCH_PROFILE_DEFINITIONS, titleCaseRole } from "../domain/constants.ts";
import type { AuditEventRecord, EvidenceItem, EvidenceSourceType, LaunchRecord } from "../domain/types.ts";

function markdownLink(label: string, href: string | undefined): string {
  if (!href) {
    return label;
  }
  return `[${label}](${href})`;
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

function evidenceMetadata(item: EvidenceItem, referenceAt: string): string {
  return `${sourceLabel(item.sourceType)} | ${item.freshness} | ${channelLabel(item)} | ${ageLabel(item.createdAt, referenceAt)}`;
}

function formatEvidenceLine(item: EvidenceItem, referenceAt: string): string {
  return `- ${markdownLink(item.title, item.permalink)} — ${evidenceMetadata(item, referenceAt)} — ${truncate(item.summary, 160)}`;
}

function approvalLine(launch: LaunchRecord, approval: LaunchRecord["approvals"][number]): string {
  const ownerAssignment = launch.ownerAssignments.find((assignment) => assignment.roleName === approval.roleName);
  const approver = approval.approverUserId ? ` · approver <@${approval.approverUserId}>` : "";
  const owner = ownerAssignment
    ? ` · owner <@${ownerAssignment.userId}> (reminders ${ownerAssignment.reminderCount})`
    : "";
  return `- **${titleCaseRole(approval.roleName)}:** ${approval.state}${approver}${owner} — ${approval.reason}`;
}

function requirementLine(requirement: LaunchRecord["requirementChecks"][number]): string {
  return `- **${requirement.label}:** ${requirement.state} — ${requirement.reason}`;
}

function ownerAssignmentLine(assignment: LaunchRecord["ownerAssignments"][number]): string {
  return (
    `- **${titleCaseRole(assignment.roleName)}:** <@${assignment.userId}> ` +
    `assigned by <@${assignment.assignedByUserId}> on ${assignment.assignedAt}` +
    (assignment.lastRemindedAt ? ` · last reminded ${assignment.lastRemindedAt}` : "") +
    ` · reminders ${assignment.reminderCount}`
  );
}

function auditLine(event: AuditEventRecord): string {
  return `- **${event.eventType.replace(/_/g, " ")}:** ${event.summary} (${event.createdAt}, <@${event.actorUserId}>)`;
}

export function buildLaunchCanvasMarkdown(launch: LaunchRecord, auditEvents: AuditEventRecord[] = []): string {
  const categoryLines = launch.categories
    .map((category) => `- **${category.name}:** ${category.state} — ${category.summary}`)
    .join("\n");
  const blockerLines =
    launch.blockers.length > 0
      ? launch.blockers
          .map((blocker) => `- **${blocker.title}** (${blocker.severity}) — ${blocker.description}`)
          .join("\n")
      : "- No open blockers.";
  const approvalLines = launch.approvals.map((approval) => approvalLine(launch, approval)).join("\n");
  const requirementLines = launch.requirementChecks.map((requirement) => requirementLine(requirement)).join("\n");
  const ownerAssignmentLines = launch.ownerAssignments.map((assignment) => ownerAssignmentLine(assignment)).join("\n");
  const evidenceCounts = collectEvidenceCounts(launch);
  const searchReceiptLines = launch.evidence
    .filter((item) => item.sourceType !== "thread_message")
    .slice(0, 5)
    .map((item) => formatEvidenceLine(item, launch.updatedAt))
    .join("\n");
  const evidenceLines = launch.evidence
    .slice(0, 12)
    .map((item) => formatEvidenceLine(item, launch.updatedAt))
    .join("\n");
  const auditLines = auditEvents.map((event) => auditLine(event)).join("\n");

  return [
    `# Launch brief: ${launch.name}`,
    "",
    `- **Workflow status:** ${launch.status}`,
    `- **Launch profile:** ${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}`,
    `- **Overall state:** ${launch.decision.overallState}`,
    `- **Confidence:** ${launch.decision.confidence}`,
    `- **Recommendation:** ${launch.decision.recommendation}`,
    `- **Next action:** ${launch.decision.nextAction}`,
    "",
    "## Status by area",
    categoryLines,
    "",
    "## Evidence used",
    `- **Thread evidence:** ${evidenceCounts.threadCount}`,
    `- **Live search messages:** ${evidenceCounts.searchMessageCount}`,
    `- **File evidence:** ${evidenceCounts.fileCount}`,
    `- **Channel evidence:** ${evidenceCounts.channelCount}`,
    "",
    "## Live search diagnostics",
    `- **Status:** ${launch.searchDiagnostics?.status ?? "not captured"}`,
    `- **Note:** ${launch.searchDiagnostics?.note ?? "GoSignal did not capture live search diagnostics for this run."}`,
    `- **Query:** ${launch.searchQuery ?? "Not recorded"}`,
    "",
    "## Live search receipts",
    searchReceiptLines || "- No live search receipts were captured on this run.",
    "",
    "## Open blockers",
    blockerLines,
    "",
    "## Required approvals",
    approvalLines,
    "",
    "## Profile checks",
    requirementLines || "- No profile-specific evidence checks were recorded.",
    "",
    "## Owner assignments",
    ownerAssignmentLines || "- No owners have been assigned yet.",
    "",
    "## Why GoSignal said this",
    launch.decision.rationale.map((line) => `- ${line}`).join("\n"),
    "",
    "## Recent audit trail",
    auditLines || "- No launch-specific audit events recorded yet.",
    "",
    "## Evidence",
    evidenceLines || "- No evidence captured."
  ].join("\n");
}
