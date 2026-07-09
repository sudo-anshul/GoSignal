export type ReadinessState = "green" | "yellow" | "red" | "needs_review";
export type ConfidenceLevel = "low" | "medium" | "high";
export type EvidenceFreshness = "fresh" | "stale" | "unknown";
export type EvidenceSourceType = "thread_message" | "search_message" | "search_file" | "search_channel";
export type ApprovalState = "approved" | "missing" | "blocked" | "needs_review";
export type Severity = "low" | "medium" | "high" | "critical";

export interface LaunchKey {
  workspaceId: string;
  sourceChannelId: string;
  sourceThreadTs: string;
}

export interface SlackMessageRecord {
  channelId: string;
  threadTs: string;
  messageTs: string;
  userId?: string;
  isBotMessage?: boolean;
  text: string;
  permalink?: string;
  createdAt: string;
}

export interface SearchEvidenceRecord {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  text: string;
  permalink?: string;
  channelId?: string;
  messageTs?: string;
  createdAt?: string;
  rawScore?: number;
}

export interface EvidenceSignalSet {
  explicitHold: boolean;
  blocker: boolean;
  rollbackMissing: boolean;
  rollbackReady: boolean;
  unresolvedIssue: boolean;
  resolvedIssue: boolean;
  dependencyRisk: boolean;
  ambiguous: boolean;
  positiveApprovalRoles: string[];
  missingApprovalRoles: string[];
  ownerUserIds: string[];
}

export interface EvidenceItem {
  id: string;
  sourceType: EvidenceSourceType;
  title: string;
  text: string;
  summary: string;
  permalink?: string;
  channelId?: string;
  messageTs?: string;
  createdAt?: string;
  categoryName: string;
  freshness: EvidenceFreshness;
  score: number;
  severity: Severity;
  signals: EvidenceSignalSet;
}

export interface ApprovalRequirement {
  roleName: string;
  state: ApprovalState;
  approverUserId?: string;
  evidenceIds: string[];
  reason: string;
}

export interface Blocker {
  id: string;
  categoryName: string;
  title: string;
  description: string;
  severity: Severity;
  status: "open" | "resolved";
  ownerUserId?: string;
  evidenceIds: string[];
}

export interface ReadinessCategory {
  name: string;
  state: ReadinessState;
  confidence: ConfidenceLevel;
  ownerUserId?: string;
  blockerCount: number;
  missingApprovalRoles: string[];
  evidenceIds: string[];
  summary: string;
}

export interface DecisionSnapshot {
  id: string;
  takenAt: string;
  overallState: ReadinessState;
  confidence: ConfidenceLevel;
  recommendation: string;
  summary: string;
  nextAction: string;
  rationale: string[];
  blockerIds: string[];
}

export interface LaunchRecord extends LaunchKey {
  id: string;
  name: string;
  createdByUserId: string;
  status: "draft" | "active" | "hold" | "ready";
  canvasId?: string;
  canvasLinkLabel?: string;
  categories: ReadinessCategory[];
  approvals: ApprovalRequirement[];
  blockers: Blocker[];
  evidence: EvidenceItem[];
  decision: DecisionSnapshot;
  searchQuery?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SearchRequest {
  actionToken?: string;
  channelId: string;
  threadTs: string;
  query: string;
}

export interface AppContextSnapshot {
  workspaceId: string;
  userId: string;
  channelId?: string;
  threadTs?: string;
  entityType?: string;
  seenAt: string;
}

export interface AnalyzeThreadInput extends LaunchKey {
  userId: string;
  actionToken?: string;
}

export interface DmResolutionInput {
  workspaceId: string;
  userId: string;
  query: string;
  context?: AppContextSnapshot;
}
