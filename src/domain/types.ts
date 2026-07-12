export type ReadinessState = "green" | "yellow" | "red" | "needs_review";
export type ConfidenceLevel = "low" | "medium" | "high";
export type EvidenceFreshness = "fresh" | "stale" | "unknown";
export type EvidenceSourceType = "thread_message" | "search_message" | "search_file" | "search_channel";
export type ApprovalState = "approved" | "missing" | "blocked" | "needs_review";
export type Severity = "low" | "medium" | "high" | "critical";
export type SearchEvidenceStatus = "used" | "empty" | "unavailable";
export type WorkspaceSearchMode = "public_only" | "thread_only";
export type LaunchStatus = "draft" | "active" | "hold" | "ready";
export type LaunchProfileId =
  | "saas_release"
  | "mobile_release"
  | "infrastructure_migration"
  | "customer_migration"
  | "security_patch"
  | "marketing_launch";
export type RequirementState = "met" | "missing" | "needs_review";
export type AuditEventType =
  | "launch_analyzed"
  | "launch_rerun"
  | "signoff_requested"
  | "launch_opened"
  | "canvas_opened"
  | "workspace_settings_updated"
  | "owner_assigned"
  | "owner_reminded"
  | "launch_exported"
  | "launch_history_viewed";

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
  channelName?: string;
  messageTs?: string;
  createdAt?: string;
  rawScore?: number;
}

export interface SearchDiagnostics {
  status: SearchEvidenceStatus;
  note: string;
  resultCount: number;
  messageCount: number;
  fileCount: number;
  channelCount: number;
}

export interface SearchContextResult {
  evidence: SearchEvidenceRecord[];
  diagnostics: SearchDiagnostics;
}

export interface WorkspaceSettingsRecord {
  workspaceId: string;
  searchMode: WorkspaceSearchMode;
  auditRetentionDays: number;
  defaultLaunchProfile: LaunchProfileId;
  updatedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuditEventRecord {
  id: string;
  workspaceId: string;
  actorUserId: string;
  eventType: AuditEventType;
  summary: string;
  launchId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
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
  channelName?: string;
  messageTs?: string;
  createdAt?: string;
  categoryName: string;
  freshness: EvidenceFreshness;
  score: number;
  severity: Severity;
  signals: EvidenceSignalSet;
}

export interface LaunchRequirementCheck {
  requirementId: string;
  label: string;
  categoryName: string;
  state: RequirementState;
  reason: string;
  evidenceIds: string[];
  severity: Severity;
}

export interface RoleOwnerAssignment {
  roleName: string;
  userId: string;
  assignedByUserId: string;
  assignedAt: string;
  lastRemindedAt?: string;
  reminderCount: number;
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
  status: LaunchStatus;
  launchProfile: LaunchProfileId;
  canvasId?: string;
  canvasLinkLabel?: string;
  categories: ReadinessCategory[];
  approvals: ApprovalRequirement[];
  requirementChecks: LaunchRequirementCheck[];
  ownerAssignments: RoleOwnerAssignment[];
  blockers: Blocker[];
  evidence: EvidenceItem[];
  decision: DecisionSnapshot;
  searchQuery?: string;
  searchDiagnostics?: SearchDiagnostics;
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
