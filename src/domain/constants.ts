import type { ConfidenceLevel, LaunchProfileId, ReadinessState, Severity } from "./types.ts";

export const READINESS_CATEGORIES = [
  "Engineering",
  "Quality",
  "Operations",
  "Comms",
  "Approvals",
  "Dependencies"
] as const;

export const DEFAULT_LAUNCH_PROFILE: LaunchProfileId = "saas_release";

export interface ProfileEvidenceRequirementDefinition {
  id: string;
  label: string;
  categoryName: typeof READINESS_CATEGORIES[number];
  severity: Severity;
  matchPhrases: readonly string[];
}

export interface LaunchProfileDefinition {
  id: LaunchProfileId;
  label: string;
  description: string;
  requiredApprovalRoles: readonly string[];
  requiredEvidence: readonly ProfileEvidenceRequirementDefinition[];
  heuristicHints: readonly string[];
}

const ROLLBACK_PLAN_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "rollback_plan",
  label: "Rollback plan",
  categoryName: "Operations",
  severity: "high",
  matchPhrases: ["rollback documented", "rollback posted", "rollback confirmed", "rollback plan is ready", "rollback is ready"]
};

const RELEASE_NOTES_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "release_notes",
  label: "Release notes",
  categoryName: "Comms",
  severity: "medium",
  matchPhrases: ["release notes ready", "release notes posted", "release notes shared", "release note is ready"]
};

const ON_CALL_OWNER_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "owner_on_call",
  label: "On-call owner",
  categoryName: "Operations",
  severity: "medium",
  matchPhrases: ["on-call owner", "owner on call", "primary on call", "pager duty owner", "pagerduty owner"]
};

const MONITORING_DASHBOARD_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "monitoring_dashboard",
  label: "Monitoring dashboard",
  categoryName: "Operations",
  severity: "medium",
  matchPhrases: ["monitoring dashboard", "dashboard ready", "metrics dashboard", "observability dashboard"]
};

const MIGRATION_WINDOW_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "migration_window",
  label: "Migration window",
  categoryName: "Dependencies",
  severity: "medium",
  matchPhrases: ["migration window", "cutover window", "maintenance window", "migration scheduled"]
};

const CUSTOMER_COMMUNICATION_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "customer_communication",
  label: "Customer communication",
  categoryName: "Comms",
  severity: "medium",
  matchPhrases: ["customer communication", "customer email sent", "customer notice posted", "customer update ready"]
};

const SUPPORT_RUNBOOK_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "support_runbook",
  label: "Support runbook",
  categoryName: "Comms",
  severity: "medium",
  matchPhrases: ["support runbook", "support playbook", "support macro ready", "support faq ready"]
};

const INCIDENT_WATCH_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "incident_watch",
  label: "Incident watch",
  categoryName: "Operations",
  severity: "medium",
  matchPhrases: ["incident watch", "war room ready", "watch rotation", "incident room ready"]
};

const APP_STORE_ROLLOUT_REQUIREMENT: ProfileEvidenceRequirementDefinition = {
  id: "app_store_rollout",
  label: "App store rollout plan",
  categoryName: "Dependencies",
  severity: "medium",
  matchPhrases: ["app store rollout", "play store rollout", "app store review approved", "rollout percentage set"]
};

export const LAUNCH_PROFILE_DEFINITIONS: Record<LaunchProfileId, LaunchProfileDefinition> = {
  saas_release: {
    id: "saas_release",
    label: "SaaS release",
    description: "General web or backend release with engineering, QA, ops, and support coordination.",
    requiredApprovalRoles: ["engineering lead", "qa lead", "ops lead", "support readiness"],
    requiredEvidence: [ROLLBACK_PLAN_REQUIREMENT, RELEASE_NOTES_REQUIREMENT, ON_CALL_OWNER_REQUIREMENT],
    heuristicHints: ["release", "rollout", "checkout", "saas", "web"]
  },
  mobile_release: {
    id: "mobile_release",
    label: "Mobile release",
    description: "Mobile app rollout with QA, support, and app store coordination.",
    requiredApprovalRoles: ["engineering lead", "qa lead", "ops lead", "support readiness", "marketing"],
    requiredEvidence: [ROLLBACK_PLAN_REQUIREMENT, RELEASE_NOTES_REQUIREMENT, APP_STORE_ROLLOUT_REQUIREMENT, ON_CALL_OWNER_REQUIREMENT],
    heuristicHints: ["mobile", "android", "ios", "app store", "play store"]
  },
  infrastructure_migration: {
    id: "infrastructure_migration",
    label: "Infrastructure migration",
    description: "Migration or cutover that needs operations, security, and monitoring readiness.",
    requiredApprovalRoles: ["engineering lead", "ops lead", "security", "support readiness"],
    requiredEvidence: [ROLLBACK_PLAN_REQUIREMENT, MONITORING_DASHBOARD_REQUIREMENT, MIGRATION_WINDOW_REQUIREMENT, ON_CALL_OWNER_REQUIREMENT],
    heuristicHints: ["migration", "cutover", "infra", "database", "cluster"]
  },
  customer_migration: {
    id: "customer_migration",
    label: "Customer migration",
    description: "Customer-facing migration with communication and support readiness requirements.",
    requiredApprovalRoles: ["engineering lead", "ops lead", "support readiness", "customer success"],
    requiredEvidence: [ROLLBACK_PLAN_REQUIREMENT, CUSTOMER_COMMUNICATION_REQUIREMENT, MIGRATION_WINDOW_REQUIREMENT, SUPPORT_RUNBOOK_REQUIREMENT],
    heuristicHints: ["customer migration", "tenant migration", "data migration", "customer move"]
  },
  security_patch: {
    id: "security_patch",
    label: "Security patch",
    description: "Security fix or hot patch that must show security review and incident watch readiness.",
    requiredApprovalRoles: ["engineering lead", "ops lead", "security"],
    requiredEvidence: [ROLLBACK_PLAN_REQUIREMENT, MONITORING_DASHBOARD_REQUIREMENT, INCIDENT_WATCH_REQUIREMENT],
    heuristicHints: ["security patch", "cve", "hotfix", "vulnerability", "security release"]
  },
  marketing_launch: {
    id: "marketing_launch",
    label: "Marketing launch",
    description: "Campaign or announcement launch centered on comms, support, and release collateral.",
    requiredApprovalRoles: ["engineering lead", "marketing", "support readiness"],
    requiredEvidence: [CUSTOMER_COMMUNICATION_REQUIREMENT, RELEASE_NOTES_REQUIREMENT, SUPPORT_RUNBOOK_REQUIREMENT],
    heuristicHints: ["campaign", "marketing", "announcement", "press", "landing page"]
  }
};

export const REQUIRED_APPROVAL_ROLES = LAUNCH_PROFILE_DEFINITIONS[DEFAULT_LAUNCH_PROFILE].requiredApprovalRoles;

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
