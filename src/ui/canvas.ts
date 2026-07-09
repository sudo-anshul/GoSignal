import type { LaunchRecord } from "../domain/types.ts";

function markdownLink(label: string, href: string | undefined): string {
  if (!href) {
    return label;
  }
  return `[${label}](${href})`;
}

export function buildLaunchCanvasMarkdown(launch: LaunchRecord): string {
  const categoryLines = launch.categories
    .map((category) => `- **${category.name}:** ${category.state} — ${category.summary}`)
    .join("\n");
  const blockerLines =
    launch.blockers.length > 0
      ? launch.blockers
          .map((blocker) => `- **${blocker.title}** (${blocker.severity}) — ${blocker.description}`)
          .join("\n")
      : "- No open blockers.";
  const approvalLines = launch.approvals
    .map((approval) => `- **${approval.roleName}:** ${approval.state} — ${approval.reason}`)
    .join("\n");
  const evidenceLines = launch.evidence
    .slice(0, 10)
    .map((item) => `- ${markdownLink(item.title, item.permalink)} — ${item.summary}`)
    .join("\n");

  return [
    `# Launch brief: ${launch.name}`,
    "",
    `- **Overall state:** ${launch.decision.overallState}`,
    `- **Confidence:** ${launch.decision.confidence}`,
    `- **Recommendation:** ${launch.decision.recommendation}`,
    `- **Next action:** ${launch.decision.nextAction}`,
    "",
    "## Status by area",
    categoryLines,
    "",
    "## Open blockers",
    blockerLines,
    "",
    "## Required approvals",
    approvalLines,
    "",
    "## Why GoSignal said this",
    launch.decision.rationale.map((line) => `- ${line}`).join("\n"),
    "",
    "## Evidence",
    evidenceLines || "- No evidence captured."
  ].join("\n");
}
