import type { LaunchRecord } from "../domain/types.ts";

export interface LLMProvider {
  summarizeLaunch(launch: LaunchRecord): Promise<string>;
}

export class DeterministicSummaryProvider implements LLMProvider {
  async summarizeLaunch(launch: LaunchRecord): Promise<string> {
    const topBlocker = launch.blockers.find((blocker) => blocker.status === "open");
    const missingApproval = launch.approvals.find((approval) => approval.state !== "approved");

    const lines = [
      `${launch.name} is ${launch.decision.overallState}.`,
      launch.decision.summary
    ];

    if (topBlocker) {
      lines.push(`Top blocker: ${topBlocker.title}.`);
    }
    if (missingApproval) {
      lines.push(`Missing sign-off: ${missingApproval.roleName}.`);
    }
    lines.push(`Next action: ${launch.decision.nextAction}`);

    return lines.join(" ");
  }
}
