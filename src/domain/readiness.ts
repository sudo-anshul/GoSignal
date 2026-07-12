import { randomUUID } from "node:crypto";
import {
  buildApprovalReplyExample,
  DEFAULT_LAUNCH_PROFILE,
  LAUNCH_PROFILE_DEFINITIONS,
  READINESS_CATEGORIES,
  type LaunchProfileDefinition,
  type ProfileEvidenceRequirementDefinition,
  STATE_PRIORITY,
  summarizeConfidence
} from "./constants.ts";
import { chooseCategory, classifySeverity, detectSignals } from "./textSignals.ts";
import type {
  ApprovalRequirement,
  Blocker,
  ConfidenceLevel,
  DecisionSnapshot,
  EvidenceFreshness,
  EvidenceItem,
  LaunchKey,
  LaunchProfileId,
  LaunchRecord,
  LaunchRequirementCheck,
  ReadinessCategory,
  ReadinessState,
  RoleOwnerAssignment,
  SearchEvidenceRecord,
  SlackMessageRecord
} from "./types.ts";

interface EvaluateLaunchInput {
  key: LaunchKey;
  name: string;
  createdByUserId: string;
  launchProfile: LaunchProfileId;
  threadMessages: SlackMessageRecord[];
  searchEvidence: SearchEvidenceRecord[];
  existingLaunch?: LaunchRecord;
  searchQuery?: string;
  now?: Date;
}

function computeFreshness(createdAt: string | undefined, now: Date): EvidenceFreshness {
  if (!createdAt) {
    return "unknown";
  }

  const timestamp = Date.parse(createdAt);
  if (Number.isNaN(timestamp)) {
    return "unknown";
  }

  const ageHours = (now.getTime() - timestamp) / 3_600_000;
  if (ageHours <= 72) {
    return "fresh";
  }
  return "stale";
}

function summarizeText(text: string): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed.length <= 140) {
    return trimmed;
  }
  return `${trimmed.slice(0, 137)}...`;
}

function normalizeForMatch(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function looksLikeGoSignalOutput(text: string): boolean {
  const normalized = normalizeForMatch(text);
  return (
    normalized.startsWith("gosignal readiness:") ||
    normalized.startsWith("gosignal still needs") ||
    normalized.startsWith("gosignal could not find a missing sign-off") ||
    normalized.startsWith("launch brief ready:")
  );
}

function shouldIgnoreThreadMessage(message: SlackMessageRecord): boolean {
  if (!message.text.trim()) {
    return true;
  }

  if (message.isBotMessage) {
    return true;
  }

  return looksLikeGoSignalOutput(message.text);
}

function normalizeEvidence(
  threadMessages: SlackMessageRecord[],
  searchEvidence: SearchEvidenceRecord[],
  now: Date
): EvidenceItem[] {
  const items: EvidenceItem[] = [];
  const seen = new Set<string>();

  for (const message of threadMessages) {
    if (shouldIgnoreThreadMessage(message)) {
      continue;
    }

    const dedupeKey = `${message.channelId}:${message.messageTs}:${message.text}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const signals = detectSignals(message.text);
    const severity = classifySeverity(signals);
    const categoryName = chooseCategory(message.text, signals);
    const baseScore = 90;
    const severityBoost = severity === "critical" ? 25 : severity === "high" ? 18 : severity === "medium" ? 8 : 0;
    items.push({
      id: `evidence-${randomUUID()}`,
      sourceType: "thread_message",
      title: `Thread evidence ${message.messageTs}`,
      text: message.text,
      summary: summarizeText(message.text),
      permalink: message.permalink,
      channelId: message.channelId,
      messageTs: message.messageTs,
      createdAt: message.createdAt,
      categoryName,
      freshness: computeFreshness(message.createdAt, now),
      score: baseScore + severityBoost,
      severity,
      signals
    });
  }

  for (const result of searchEvidence) {
    const dedupeKey = `${result.sourceType}:${result.permalink ?? result.id}:${result.text}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    const signals = detectSignals(result.text);
    const severity = classifySeverity(signals);
    const categoryName = chooseCategory(result.text, signals);
    const baseScore = result.sourceType === "search_message" ? 70 : 55;
    const severityBoost = severity === "critical" ? 20 : severity === "high" ? 14 : severity === "medium" ? 6 : 0;
    items.push({
      id: `evidence-${randomUUID()}`,
      sourceType: result.sourceType,
      title: result.title,
      text: result.text,
      summary: summarizeText(result.text),
      permalink: result.permalink,
      channelId: result.channelId,
      channelName: result.channelName,
      messageTs: result.messageTs,
      createdAt: result.createdAt,
      categoryName,
      freshness: computeFreshness(result.createdAt, now),
      score: baseScore + severityBoost + Math.max(Math.floor(result.rawScore ?? 0), 0),
      severity,
      signals
    });
  }

  return items.sort((left, right) => right.score - left.score);
}

function buildApprovals(evidence: EvidenceItem[], requiredApprovalRoles: readonly string[]): ApprovalRequirement[] {
  return requiredApprovalRoles.map((roleName) => {
    const positive = evidence.find((item) => item.signals.positiveApprovalRoles.includes(roleName));
    if (positive) {
      return {
        roleName,
        state: "approved",
        approverUserId: positive.signals.ownerUserIds[0],
        evidenceIds: [positive.id],
        reason: `${roleName} explicitly approved in Slack evidence.`
      } satisfies ApprovalRequirement;
    }

    const negative = evidence.find((item) => item.signals.missingApprovalRoles.includes(roleName));
    if (negative) {
      return {
        roleName,
        state: negative.signals.ambiguous ? "needs_review" : "missing",
        approverUserId: negative.signals.ownerUserIds[0],
        evidenceIds: [negative.id],
        reason: `${roleName} is still missing or unconfirmed.`
      } satisfies ApprovalRequirement;
    }

    return {
      roleName,
      state: "missing",
      evidenceIds: [],
      reason: `No explicit ${roleName} confirmation was found. Ask someone to reply with: "${buildApprovalReplyExample(roleName)}"`
    } satisfies ApprovalRequirement;
  });
}

function buildRequirementChecks(
  evidence: EvidenceItem[],
  profile: LaunchProfileDefinition
): LaunchRequirementCheck[] {
  return profile.requiredEvidence.map((requirement) => {
    const matchingEvidence = evidence.filter((item) => matchesRequirement(item, requirement));
    if (matchingEvidence.length > 0) {
      return {
        requirementId: requirement.id,
        label: requirement.label,
        categoryName: requirement.categoryName,
        state: "met",
        reason: `${requirement.label} is explicitly present in Slack evidence.`,
        evidenceIds: matchingEvidence.map((item) => item.id),
        severity: requirement.severity
      } satisfies LaunchRequirementCheck;
    }

    return {
      requirementId: requirement.id,
      label: requirement.label,
      categoryName: requirement.categoryName,
      state: "missing",
      reason: `${requirement.label} is required for the ${profile.label.toLowerCase()} profile but no explicit evidence was found.`,
      evidenceIds: [],
      severity: requirement.severity
    } satisfies LaunchRequirementCheck;
  });
}

function matchesRequirement(item: EvidenceItem, requirement: ProfileEvidenceRequirementDefinition): boolean {
  const text = normalizeForMatch(`${item.title} ${item.text}`);
  if (requirement.id === "rollback_plan") {
    return item.signals.rollbackReady || requirement.matchPhrases.some((phrase) => text.includes(phrase));
  }

  return requirement.matchPhrases.some((phrase) => text.includes(phrase));
}

function buildBlockers(evidence: EvidenceItem[], requirementChecks: LaunchRequirementCheck[]): Blocker[] {
  const blockers: Blocker[] = [];
  const seenTitles = new Set<string>();

  for (const item of evidence) {
    const shouldCreate =
      item.signals.explicitHold || item.signals.rollbackMissing || item.signals.unresolvedIssue || item.signals.blocker;
    if (!shouldCreate) {
      continue;
    }

    const title = item.signals.rollbackMissing
      ? "Rollback plan missing"
      : item.signals.explicitHold
        ? "Launch explicitly on hold"
        : item.signals.unresolvedIssue
          ? "Unresolved issue still open"
          : "Blocking issue detected";
    const key = `${item.categoryName}:${title}`;
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);

    blockers.push({
      id: `blocker-${randomUUID()}`,
      categoryName: item.categoryName,
      title,
      description: item.summary,
      severity: item.severity,
      status: item.signals.resolvedIssue ? "resolved" : "open",
      ownerUserId: item.signals.ownerUserIds[0],
      evidenceIds: [item.id]
    });
  }

  for (const requirement of requirementChecks.filter((check) => check.state === "missing")) {
    const title = `${requirement.label} missing`;
    const key = `${requirement.categoryName}:${title}`;
    if (seenTitles.has(key)) {
      continue;
    }
    seenTitles.add(key);

    blockers.push({
      id: `blocker-${randomUUID()}`,
      categoryName: requirement.categoryName,
      title,
      description: requirement.reason,
      severity: requirement.severity,
      status: "open",
      evidenceIds: requirement.evidenceIds
    });
  }

  return blockers.sort(
    (left, right) => STATE_PRIORITY.indexOf(mapSeverityToState(left.severity)) - STATE_PRIORITY.indexOf(mapSeverityToState(right.severity))
  );
}

function mapSeverityToState(severity: Blocker["severity"]): ReadinessState {
  switch (severity) {
    case "critical":
    case "high":
      return "red";
    case "medium":
      return "yellow";
    default:
      return "green";
  }
}

function determineCategoryState(
  categoryName: string,
  relevantEvidence: EvidenceItem[],
  blockers: Blocker[],
  approvals: ApprovalRequirement[],
  requirementChecks: LaunchRequirementCheck[]
): ReadinessCategory {
  const openBlockers = blockers.filter((blocker) => blocker.categoryName === categoryName && blocker.status === "open");
  const missingApprovals = categoryName === "Approvals"
    ? approvals.filter((approval) => approval.state !== "approved").map((approval) => approval.roleName)
    : [];
  const missingRequirements = requirementChecks
    .filter((requirement) => requirement.categoryName === categoryName && requirement.state !== "met")
    .map((requirement) => requirement.label);
  const hasAmbiguity = relevantEvidence.some((item) => item.signals.ambiguous);
  const hasFreshEvidence = relevantEvidence.some((item) => item.freshness === "fresh");

  let state: ReadinessState = "green";
  if (openBlockers.some((blocker) => blocker.severity === "critical" || blocker.severity === "high")) {
    state = "red";
  } else if (missingApprovals.length > 0) {
    state = hasAmbiguity ? "needs_review" : "yellow";
  } else if (missingRequirements.length > 0) {
    state = "yellow";
  } else if (hasAmbiguity) {
    state = "needs_review";
  } else if (relevantEvidence.length === 0) {
    state = categoryName === "Comms" || categoryName === "Dependencies" ? "green" : "yellow";
  } else if (categoryName === "Approvals") {
    state = "green";
  } else if (openBlockers.length > 0 || relevantEvidence.some((item) => item.severity === "medium" || item.signals.dependencyRisk)) {
    state = "yellow";
  }

  const confidenceScore =
    (hasFreshEvidence ? 40 : 20) +
    Math.min(relevantEvidence.length * 15, 45) -
    (hasAmbiguity ? 20 : 0) -
    (missingApprovals.length > 0 ? 10 : 0) -
    (missingRequirements.length > 0 ? 10 : 0);

  const confidence = summarizeConfidence(confidenceScore);

  return {
    name: categoryName,
    state,
    confidence,
    ownerUserId: relevantEvidence.flatMap((item) => item.signals.ownerUserIds)[0],
    blockerCount: openBlockers.length,
    missingApprovalRoles: missingApprovals,
    evidenceIds: relevantEvidence.map((item) => item.id),
    summary: summarizeCategory(categoryName, state, openBlockers, relevantEvidence, missingApprovals, missingRequirements)
  };
}

function summarizeCategory(
  categoryName: string,
  state: ReadinessState,
  blockers: Blocker[],
  evidence: EvidenceItem[],
  missingApprovals: string[],
  missingRequirements: string[]
): string {
  if (blockers.length > 0) {
    return `${categoryName} is ${state} because ${blockers[0]?.title.toLowerCase()}.`;
  }
  if (missingApprovals.length > 0) {
    return `${categoryName} is ${state} because ${missingApprovals.join(", ")} is still missing.`;
  }
  if (missingRequirements.length > 0) {
    return `${categoryName} is ${state} because ${missingRequirements.join(", ")} still needs explicit evidence.`;
  }
  if (evidence.length === 0) {
    return `${categoryName} needs review because no explicit evidence was found.`;
  }
  if (state === "needs_review") {
    return `${categoryName} needs review because the evidence is incomplete or ambiguous.`;
  }
  return `${categoryName} is ${state} based on explicit Slack evidence.`;
}

function determineOverallState(
  allCategories: ReadinessCategory[],
  approvals: ApprovalRequirement[],
  blockers: Blocker[],
  requirementChecks: LaunchRequirementCheck[]
): ReadinessState {
  const openHighBlocker = blockers.some((blocker) => blocker.status === "open" && (blocker.severity === "critical" || blocker.severity === "high"));
  if (openHighBlocker || allCategories.some((category) => category.state === "red")) {
    return "red";
  }
  if (allCategories.some((category) => category.state === "needs_review")) {
    return "needs_review";
  }
  if (
    approvals.some((approval) => approval.state !== "approved") ||
    requirementChecks.some((requirement) => requirement.state !== "met") ||
    allCategories.some((category) => category.state === "yellow")
  ) {
    return "yellow";
  }
  return "green";
}

function determineRecommendation(
  overallState: ReadinessState,
  blockers: Blocker[],
  approvals: ApprovalRequirement[],
  requirementChecks: LaunchRequirementCheck[],
  ownerAssignments: RoleOwnerAssignment[]
): { recommendation: string; nextAction: string; rationale: string[] } {
  const topBlocker = blockers.find((blocker) => blocker.status === "open");
  const missingApproval = approvals.find((approval) => approval.state !== "approved");
  const missingRequirement = requirementChecks.find((requirement) => requirement.state !== "met");
  const missingApprovalOwner =
    missingApproval ? ownerAssignments.find((assignment) => assignment.roleName === missingApproval.roleName) : undefined;

  if (overallState === "red" && topBlocker) {
    return {
      recommendation: "Hold for now.",
      nextAction: `Resolve ${topBlocker.title.toLowerCase()} and re-run readiness.`,
      rationale: [
        `${topBlocker.title} is still open.`,
        "GoSignal found explicit evidence that the launch is not ready."
      ]
    };
  }

  if (overallState === "needs_review") {
    return {
      recommendation: "Pause and review with a human owner.",
      nextAction: "Review ambiguous evidence and confirm the missing source of truth.",
      rationale: [
        "The evidence is too ambiguous to safely force a green or yellow state.",
        "GoSignal is defaulting to needs_review instead of inventing confidence."
      ]
    };
  }

  if (overallState === "yellow") {
    if (missingApproval) {
      return {
        recommendation: "Proceed with caution.",
        nextAction: missingApprovalOwner
          ? `Remind <@${missingApprovalOwner.userId}> to secure ${missingApproval.roleName}.`
          : `Request ${missingApproval.roleName} before recommending green.`,
        rationale: [
          `${missingApproval.roleName} is still missing.`,
          missingApprovalOwner
            ? `${missingApproval.roleName} is assigned to <@${missingApprovalOwner.userId}> for follow-up.`
            : "The launch appears close, but sign-off is incomplete."
        ]
      };
    }

    if (missingRequirement) {
      return {
        recommendation: "Proceed with caution.",
        nextAction: `Add explicit evidence for ${missingRequirement.label.toLowerCase()} and re-run readiness.`,
        rationale: [
          `${missingRequirement.label} is required for the selected launch profile.`,
          "The launch is missing profile-specific evidence even though no hard blocker was detected."
        ]
      };
    }

    return {
      recommendation: "Proceed with caution.",
      nextAction: topBlocker
        ? `Resolve ${topBlocker.title.toLowerCase()} and re-run readiness.`
        : "Review remaining yellow categories and re-run if the thread changes.",
      rationale: [
        "GoSignal found incomplete readiness evidence that is not severe enough for a red state.",
        "The launch is close, but at least one area still needs follow-up."
      ]
    };
  }

  return {
    recommendation: "Ready to launch.",
    nextAction: "Keep monitoring the thread and re-run if the context changes.",
    rationale: [
      "All required approvals and profile-specific evidence checks are satisfied.",
      "No open blockers remain in the monitored launch thread."
    ]
  };
}

function buildSummary(
  name: string,
  overallState: ReadinessState,
  confidence: ConfidenceLevel,
  blockers: Blocker[],
  approvals: ApprovalRequirement[],
  requirementChecks: LaunchRequirementCheck[]
): string {
  const topBlocker = blockers.find((blocker) => blocker.status === "open");
  const missingApproval = approvals.find((approval) => approval.state !== "approved");
  const missingRequirement = requirementChecks.find((requirement) => requirement.state !== "met");

  if (overallState === "red" && topBlocker) {
    return `${name} is ${overallState} with ${confidence} confidence because ${topBlocker.title.toLowerCase()} is still unresolved.`;
  }
  if (overallState === "needs_review") {
    return `${name} needs review because the thread contains ambiguous or incomplete launch signals.`;
  }
  if (overallState === "yellow") {
    if (missingApproval) {
      return `${name} is yellow with ${confidence} confidence because ${missingApproval.roleName} is still missing.`;
    }
    if (missingRequirement) {
      return `${name} is yellow with ${confidence} confidence because ${missingRequirement.label.toLowerCase()} still needs explicit evidence.`;
    }
    if (topBlocker) {
      return `${name} is yellow with ${confidence} confidence because ${topBlocker.title.toLowerCase()} still needs follow-up.`;
    }
    return `${name} is yellow with ${confidence} confidence because one or more readiness areas are still incomplete.`;
  }
  return `${name} is green with ${confidence} confidence based on explicit approvals and profile-ready evidence.`;
}

function findLaunchLabel(threadMessages: SlackMessageRecord[], fallback?: string): string {
  for (const message of threadMessages) {
    const lines = message.text.split("\n");
    for (const line of lines) {
      const match = line.match(/^\s*(?:pm:\s*)?launch:\s*(.+?)\s*$/i);
      if (match?.[1]) {
        return match[1].trim();
      }
    }
  }

  return fallback ?? threadMessages[0]?.text ?? "Untitled launch";
}

function normalizeProfileLabel(value: string): string {
  return normalizeForMatch(value)
    .replace(/launch profile:\s*/g, "")
    .replace(/profile:\s*/g, "");
}

function resolveProfileFromText(value: string): LaunchProfileId | undefined {
  const normalized = normalizeProfileLabel(value);
  for (const [profileId, profile] of Object.entries(LAUNCH_PROFILE_DEFINITIONS) as Array<[LaunchProfileId, LaunchProfileDefinition]>) {
    if (normalized === normalizeForMatch(profile.label) || normalized === profileId.replace(/_/g, " ")) {
      return profileId;
    }
    if (profile.heuristicHints.some((hint) => normalized.includes(normalizeForMatch(hint)))) {
      return profileId;
    }
  }
  return undefined;
}

export function deriveLaunchName(threadMessages: SlackMessageRecord[], fallback?: string): string {
  const root = findLaunchLabel(threadMessages, fallback);
  const normalized = root.replace(/\s+/g, " ").trim();
  if (normalized.length <= 70) {
    return normalized;
  }
  return `${normalized.slice(0, 67)}...`;
}

export function deriveLaunchProfile(
  threadMessages: SlackMessageRecord[],
  defaultProfile: LaunchProfileId = DEFAULT_LAUNCH_PROFILE,
  fallback?: LaunchProfileId
): LaunchProfileId {
  for (const message of threadMessages) {
    const lines = message.text.split("\n");
    for (const line of lines) {
      const explicitMatch = line.match(/^\s*(?:launch\s+)?profile:\s*(.+?)\s*$/i);
      if (explicitMatch?.[1]) {
        return resolveProfileFromText(explicitMatch[1]) ?? fallback ?? defaultProfile;
      }
    }
  }

  const combinedText = normalizeForMatch(threadMessages.map((message) => message.text).join("\n"));
  for (const [profileId, profile] of Object.entries(LAUNCH_PROFILE_DEFINITIONS) as Array<[LaunchProfileId, LaunchProfileDefinition]>) {
    if (profile.heuristicHints.some((hint) => combinedText.includes(normalizeForMatch(hint)))) {
      return profileId;
    }
  }

  return fallback ?? defaultProfile;
}

export function buildSearchQuery(name: string, launchProfile: LaunchProfileId = DEFAULT_LAUNCH_PROFILE): string {
  const profile = LAUNCH_PROFILE_DEFINITIONS[launchProfile];
  return (
    `Find public Slack evidence for ${name}. ` +
    `This is a ${profile.label.toLowerCase()} launch. ` +
    `Look for blockers, profile-specific requirements, rollback status, dependency risks, and explicit approvals.`
  );
}

export function evaluateLaunchReadiness(input: EvaluateLaunchInput): LaunchRecord {
  const now = input.now ?? new Date();
  const profile = LAUNCH_PROFILE_DEFINITIONS[input.launchProfile];
  const evidence = normalizeEvidence(input.threadMessages, input.searchEvidence, now);
  const approvals = buildApprovals(evidence, profile.requiredApprovalRoles);
  const requirementChecks = buildRequirementChecks(evidence, profile);
  const ownerAssignments = input.existingLaunch?.ownerAssignments ?? [];
  const blockers = buildBlockers(evidence, requirementChecks);
  const categories = READINESS_CATEGORIES.map((categoryName) =>
    determineCategoryState(
      categoryName,
      evidence.filter((item) => item.categoryName === categoryName),
      blockers,
      approvals,
      requirementChecks
    )
  );
  const overallState = determineOverallState(categories, approvals, blockers, requirementChecks);
  const confidenceScore =
    categories.reduce((total, category) => total + (category.confidence === "high" ? 30 : category.confidence === "medium" ? 20 : 10), 0) /
    Math.max(categories.length, 1);
  const confidence = summarizeConfidence(confidenceScore);
  const { recommendation, nextAction, rationale } = determineRecommendation(
    overallState,
    blockers,
    approvals,
    requirementChecks,
    ownerAssignments
  );

  const decision: DecisionSnapshot = {
    id: `decision-${randomUUID()}`,
    takenAt: now.toISOString(),
    overallState,
    confidence,
    recommendation,
    summary: buildSummary(input.name, overallState, confidence, blockers, approvals, requirementChecks),
    nextAction,
    rationale: [`Profile: ${profile.label}.`, ...rationale],
    blockerIds: blockers.filter((blocker) => blocker.status === "open").map((blocker) => blocker.id)
  };

  return {
    id: input.existingLaunch?.id ?? `launch-${randomUUID()}`,
    workspaceId: input.key.workspaceId,
    sourceChannelId: input.key.sourceChannelId,
    sourceThreadTs: input.key.sourceThreadTs,
    name: input.name,
    createdByUserId: input.createdByUserId,
    status: overallState === "green" ? "ready" : overallState === "red" ? "hold" : "active",
    launchProfile: input.launchProfile,
    canvasId: input.existingLaunch?.canvasId,
    canvasLinkLabel: input.existingLaunch?.canvasLinkLabel,
    categories,
    approvals,
    requirementChecks,
    ownerAssignments,
    blockers,
    evidence,
    decision,
    searchQuery: input.searchQuery,
    createdAt: input.existingLaunch?.createdAt ?? now.toISOString(),
    updatedAt: now.toISOString()
  };
}
