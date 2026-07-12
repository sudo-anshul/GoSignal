import {
  AMBIGUOUS_PHRASES,
  BLOCKER_PHRASES,
  DEPENDENCY_PHRASES,
  NEGATIVE_APPROVAL_PHRASES,
  POSITIVE_APPROVAL_PHRASES,
  RESOLVED_ISSUE_PHRASES,
  ROLLBACK_READY_PHRASES,
  ROLLBACK_RISK_PHRASES,
  UNRESOLVED_ISSUE_PHRASES
} from "./constants.ts";
import type { EvidenceSignalSet, Severity } from "./types.ts";

const ROLE_ALIASES: Record<string, string[]> = {
  "engineering lead": ["engineering lead", "engineering", "eng lead", "eng", "dev", "tech lead"],
  "qa lead": ["qa lead", "qa", "quality lead", "quality", "test lead", "test"],
  "ops lead": ["ops lead", "ops", "operations lead", "operations", "sre lead", "sre"],
  "support readiness": ["support readiness", "support", "cx", "customer support"],
  marketing: ["marketing lead", "marketing", "comms lead", "comms", "communications"],
  security: ["security lead", "security", "sec lead", "security review"],
  "customer success": ["customer success", "cs lead", "success lead", "account team"]
};

function includesAny(text: string, phrases: string[]): boolean {
  return phrases.some((phrase) => text.includes(phrase));
}

function collectRoles(text: string, phrases: string[]): string[] {
  const matched: string[] = [];
  for (const [role, aliases] of Object.entries(ROLE_ALIASES)) {
    const hasAlias = aliases.some((alias) => text.includes(alias));
    const hasPhrase = phrases.some((phrase) => text.includes(phrase));
    if (hasAlias && hasPhrase) {
      matched.push(role);
    }
  }
  return matched;
}

function extractOwnerUserIds(text: string): string[] {
  const matches = text.match(/<@([A-Z0-9]+)>/g) ?? [];
  return matches.map((match) => match.slice(2, -1));
}

function hasKnownRoleMention(text: string): boolean {
  return Object.values(ROLE_ALIASES).some((aliases) => aliases.some((alias) => text.includes(alias)));
}

export function detectSignals(rawText: string): EvidenceSignalSet {
  const text = rawText.toLowerCase();

  return {
    explicitHold: includesAny(text, ["stop ship", "stop-ship", "hold", "cannot launch", "can't launch"]),
    blocker: includesAny(text, BLOCKER_PHRASES),
    rollbackMissing: includesAny(text, ROLLBACK_RISK_PHRASES),
    rollbackReady: includesAny(text, ROLLBACK_READY_PHRASES),
    unresolvedIssue: includesAny(text, UNRESOLVED_ISSUE_PHRASES),
    resolvedIssue: includesAny(text, RESOLVED_ISSUE_PHRASES),
    dependencyRisk: includesAny(text, DEPENDENCY_PHRASES),
    ambiguous: includesAny(text, AMBIGUOUS_PHRASES),
    positiveApprovalRoles: collectRoles(text, POSITIVE_APPROVAL_PHRASES),
    missingApprovalRoles: collectRoles(text, NEGATIVE_APPROVAL_PHRASES),
    ownerUserIds: extractOwnerUserIds(rawText)
  };
}

export function classifySeverity(signals: EvidenceSignalSet): Severity {
  if (signals.explicitHold || (signals.rollbackMissing && signals.unresolvedIssue)) {
    return "critical";
  }
  if (signals.blocker || signals.rollbackMissing || signals.unresolvedIssue) {
    return "high";
  }
  if (signals.dependencyRisk || signals.missingApprovalRoles.length > 0) {
    return "medium";
  }
  return "low";
}

export function chooseCategory(text: string, signals: EvidenceSignalSet): string {
  const lower = text.toLowerCase();
  const looksLikeApprovalFlow =
    signals.positiveApprovalRoles.length > 0 ||
    signals.missingApprovalRoles.length > 0 ||
    ((lower.includes("sign-off") || lower.includes("approval")) && hasKnownRoleMention(lower));

  if (signals.rollbackMissing || signals.rollbackReady || lower.includes("ops") || lower.includes("operations")) {
    return "Operations";
  }
  if (signals.unresolvedIssue || lower.includes("qa") || lower.includes("quality") || lower.includes("test")) {
    return "Quality";
  }
  if (looksLikeApprovalFlow) {
    return "Approvals";
  }
  if (signals.dependencyRisk) {
    return "Dependencies";
  }
  if (lower.includes("sign-off") || lower.includes("approval")) {
    return "Approvals";
  }
  if (lower.includes("marketing") || lower.includes("comms") || lower.includes("release note")) {
    return "Comms";
  }
  return "Engineering";
}
