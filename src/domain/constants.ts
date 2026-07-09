import type { ConfidenceLevel, ReadinessState } from "./types.ts";

export const READINESS_CATEGORIES = [
  "Engineering",
  "Quality",
  "Operations",
  "Comms",
  "Approvals",
  "Dependencies"
] as const;

export const REQUIRED_APPROVAL_ROLES = [
  "engineering lead",
  "qa lead",
  "ops lead",
  "support readiness"
] as const;

export function titleCaseRole(roleName: string): string {
  return roleName
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function buildApprovalReplyExample(roleName: string): string {
  return `${titleCaseRole(roleName)} approved for launch. <@USER>`;
}

export const POSITIVE_APPROVAL_PHRASES = [
  "approved",
  "approve",
  "signed off",
  "sign off",
  "green",
  "ready",
  "good to go",
  "ship it",
  "looks good"
];

export const NEGATIVE_APPROVAL_PHRASES = [
  "missing sign-off",
  "missing approval",
  "still need approval",
  "waiting on approval",
  "not approved",
  "unconfirmed"
];

export const AMBIGUOUS_PHRASES = [
  "mostly fine",
  "should be okay",
  "probably",
  "might be okay",
  "tentative",
  "i think",
  "maybe"
];

export const BLOCKER_PHRASES = [
  "blocker",
  "blocked",
  "blocking",
  "stop ship",
  "stop-ship",
  "hold",
  "cannot launch",
  "can't launch",
  "do not launch",
  "not ready"
];

export const UNRESOLVED_ISSUE_PHRASES = [
  "regression",
  "bug",
  "failing",
  "incident",
  "outage",
  "sev1",
  "sev 1",
  "critical issue",
  "unresolved"
];

export const RESOLVED_ISSUE_PHRASES = [
  "resolved",
  "fixed",
  "mitigated",
  "cleared",
  "verified"
];

export const DEPENDENCY_PHRASES = [
  "waiting on",
  "blocked by",
  "dependency",
  "upstream",
  "vendor",
  "pending asset"
];

export const ROLLBACK_RISK_PHRASES = [
  "rollback missing",
  "no rollback",
  "missing rollback",
  "rollback still missing",
  "haven't posted the rollback",
  "rollback unconfirmed"
];

export const ROLLBACK_READY_PHRASES = [
  "rollback is ready",
  "rollback plan is ready",
  "rollback documented",
  "rollback posted",
  "rollback confirmed"
];

export const STATE_PRIORITY: ReadinessState[] = ["red", "needs_review", "yellow", "green"];

export function summarizeConfidence(score: number): ConfidenceLevel {
  if (score >= 80) {
    return "high";
  }
  if (score >= 50) {
    return "medium";
  }
  return "low";
}
