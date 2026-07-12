import type { WebClient } from "@slack/web-api";
import { buildSearchQuery, deriveLaunchName, deriveLaunchProfile, evaluateLaunchReadiness } from "../domain/readiness.ts";
import type {
  AnalyzeThreadInput,
  AppContextSnapshot,
  DmResolutionInput,
  LaunchRecord,
  RoleOwnerAssignment,
  SearchContextResult
} from "../domain/types.ts";
import type { LaunchRepository } from "../repositories/launchRepository.ts";
import type { LLMProvider } from "./llmProvider.ts";
import type { CanvasGateway, SearchSource, ThreadSource } from "./slackSources.ts";
import { buildLaunchCanvasMarkdown } from "../ui/canvas.ts";
import { WorkspaceAdminService } from "./workspaceAdminService.ts";

export interface LaunchServiceDependencies {
  repository: LaunchRepository;
  threadSource: ThreadSource;
  searchSource: SearchSource;
  canvasGateway: CanvasGateway;
  summaryProvider: LLMProvider;
  workspaceAdminService: WorkspaceAdminService;
}

export class LaunchService {
  private readonly dependencies: LaunchServiceDependencies;

  constructor(dependencies: LaunchServiceDependencies) {
    this.dependencies = dependencies;
  }

  async analyzeThread(client: WebClient, input: AnalyzeThreadInput): Promise<LaunchRecord> {
    const existingLaunch = await this.dependencies.repository.findByThread(input);
    const workspaceSettings = await this.dependencies.workspaceAdminService.getSettings(input.workspaceId, input.userId);
    const threadMessages = await this.dependencies.threadSource.fetchThread(client, input.sourceChannelId, input.sourceThreadTs);
    const launchName = deriveLaunchName(threadMessages, existingLaunch?.name);
    const launchProfile = deriveLaunchProfile(
      threadMessages,
      workspaceSettings.defaultLaunchProfile,
      existingLaunch?.launchProfile
    );
    const searchQuery = buildSearchQuery(launchName, launchProfile);
    const searchContext =
      workspaceSettings.searchMode === "thread_only"
        ? buildThreadOnlySearchContext()
        : await this.dependencies.searchSource.searchPublicContext(client, {
            actionToken: input.actionToken,
            channelId: input.sourceChannelId,
            threadTs: input.sourceThreadTs,
            query: searchQuery
          });

    const launch = evaluateLaunchReadiness({
      key: input,
      name: launchName,
      createdByUserId: input.userId,
      launchProfile,
      threadMessages,
      searchEvidence: searchContext.evidence,
      existingLaunch,
      searchQuery
    });
    launch.searchDiagnostics = searchContext.diagnostics;
    launch.decision.summary = await this.dependencies.summaryProvider.summarizeLaunch(launch);

    let savedLaunch = await this.persistLaunchWithCanvas(client, launch);
    try {
      await this.dependencies.workspaceAdminService.recordEvent({
        workspaceId: input.workspaceId,
        actorUserId: input.userId,
        eventType: existingLaunch ? "launch_rerun" : "launch_analyzed",
        summary:
          `${existingLaunch ? "Re-ran" : "Analyzed"} launch readiness for ${savedLaunch.name} ` +
          `(${savedLaunch.decision.overallState}, ${workspaceSettings.searchMode === "thread_only" ? "thread-only" : "live search enabled"}).`,
        launchId: savedLaunch.id,
        metadata: {
          overallState: savedLaunch.decision.overallState,
          searchMode: workspaceSettings.searchMode,
          searchStatus: savedLaunch.searchDiagnostics?.status ?? "not_captured"
        }
      });
      savedLaunch = await this.persistLaunchWithCanvas(client, savedLaunch);
    } catch (error) {
      console.warn("[GoSignal warning] Failed to write audit event for launch analysis.", error);
    }

    return savedLaunch;
  }

  async resolveLaunchForDmQuery(input: DmResolutionInput): Promise<LaunchRecord | undefined> {
    const byContext = await this.findLaunchFromContext(input.workspaceId, input.context);
    if (byContext) {
      return byContext;
    }

    const byName = await this.dependencies.repository.searchByName(input.workspaceId, input.query, 1);
    if (byName.length > 0) {
      return byName[0];
    }

    return this.dependencies.repository.findLatestByUser(input.workspaceId, input.userId);
  }

  async answerLaunchQuestion(launch: LaunchRecord, question: string): Promise<string> {
    return this.dependencies.summaryProvider.answerLaunchQuestion(launch, question);
  }

  async rerunLaunch(client: WebClient, launchId: string, actionToken?: string): Promise<LaunchRecord | undefined> {
    const launch = await this.dependencies.repository.findById(launchId);
    if (!launch) {
      return undefined;
    }

    return this.analyzeThread(client, {
      workspaceId: launch.workspaceId,
      sourceChannelId: launch.sourceChannelId,
      sourceThreadTs: launch.sourceThreadTs,
      userId: launch.createdByUserId,
      actionToken
    });
  }

  async listRecentLaunches(workspaceId: string, limit = 5): Promise<LaunchRecord[]> {
    return this.dependencies.repository.listRecentForWorkspace(workspaceId, limit);
  }

  async getLaunchById(launchId: string): Promise<LaunchRecord | undefined> {
    return this.dependencies.repository.findById(launchId);
  }

  async assignOwner(
    client: WebClient,
    launchId: string,
    roleName: string,
    ownerUserId: string,
    assignedByUserId: string
  ): Promise<LaunchRecord | undefined> {
    const launch = await this.dependencies.repository.findById(launchId);
    if (!launch) {
      return undefined;
    }

    const now = new Date().toISOString();
    const ownerAssignments = launch.ownerAssignments.filter((assignment) => assignment.roleName !== roleName);
    ownerAssignments.push({
      roleName,
      userId: ownerUserId,
      assignedByUserId,
      assignedAt: now,
      reminderCount: 0
    } satisfies RoleOwnerAssignment);

    const updatedLaunch: LaunchRecord = {
      ...launch,
      ownerAssignments,
      updatedAt: now
    };

    let savedLaunch = await this.persistLaunchWithCanvas(client, updatedLaunch);
    try {
      await this.dependencies.workspaceAdminService.recordEvent({
        workspaceId: savedLaunch.workspaceId,
        actorUserId: assignedByUserId,
        eventType: "owner_assigned",
        summary: `Assigned ${roleName} to <@${ownerUserId}> for ${savedLaunch.name}.`,
        launchId: savedLaunch.id,
        metadata: {
          roleName,
          ownerUserId
        }
      });
      savedLaunch = await this.persistLaunchWithCanvas(client, savedLaunch);
    } catch (error) {
      console.warn("[GoSignal warning] Failed to write owner assignment audit event.", error);
    }

    return savedLaunch;
  }

  async recordOwnerReminder(
    client: WebClient,
    launchId: string,
    roleName: string,
    actorUserId: string
  ): Promise<LaunchRecord | undefined> {
    const launch = await this.dependencies.repository.findById(launchId);
    if (!launch) {
      return undefined;
    }

    const now = new Date().toISOString();
    const ownerAssignments = launch.ownerAssignments.map((assignment) =>
      assignment.roleName === roleName
        ? {
            ...assignment,
            lastRemindedAt: now,
            reminderCount: assignment.reminderCount + 1
          }
        : assignment
    );

    const updatedLaunch: LaunchRecord = {
      ...launch,
      ownerAssignments,
      updatedAt: now
    };
    let savedLaunch = await this.persistLaunchWithCanvas(client, updatedLaunch);

    const ownerAssignment = savedLaunch.ownerAssignments.find((assignment) => assignment.roleName === roleName);
    try {
      await this.dependencies.workspaceAdminService.recordEvent({
        workspaceId: savedLaunch.workspaceId,
        actorUserId,
        eventType: "owner_reminded",
        summary: ownerAssignment
          ? `Reminded <@${ownerAssignment.userId}> about ${roleName} for ${savedLaunch.name}.`
          : `Attempted to remind an owner for ${roleName} on ${savedLaunch.name}.`,
        launchId: savedLaunch.id,
        metadata: {
          roleName,
          ownerUserId: ownerAssignment?.userId
        }
      });
      savedLaunch = await this.persistLaunchWithCanvas(client, savedLaunch);
    } catch (error) {
      console.warn("[GoSignal warning] Failed to write owner reminder audit event.", error);
    }

    return savedLaunch;
  }

  async buildLaunchExport(launchId: string): Promise<{ launch: LaunchRecord; markdown: string } | undefined> {
    const launch = await this.dependencies.repository.findById(launchId);
    if (!launch) {
      return undefined;
    }

    const auditEvents = await this.dependencies.workspaceAdminService.listRecentAuditEventsForLaunch(
      launch.workspaceId,
      launch.id,
      8
    );

    return {
      launch,
      markdown: buildLaunchCanvasMarkdown(launch, auditEvents)
    };
  }

  buildOwnerReminderText(launch: LaunchRecord, roleName: string): string {
    const ownerAssignment = launch.ownerAssignments.find((assignment) => assignment.roleName === roleName);
    const approval = launch.approvals.find((item) => item.roleName === roleName);
    if (!ownerAssignment) {
      return `GoSignal has not assigned an owner for *${roleName}* on *${launch.name}* yet. Assign an owner first, then re-run the reminder.`;
    }

    return (
      `Reminder for <@${ownerAssignment.userId}>: GoSignal still needs *${roleName}* on *${launch.name}*. ` +
      `${approval?.reason ?? "Please reply in this thread with a clear sign-off or update the status."}`
    );
  }

  async getLaunchHistory(launchId: string, limit = 8) {
    const launch = await this.dependencies.repository.findById(launchId);
    if (!launch) {
      return undefined;
    }

    const events = await this.dependencies.workspaceAdminService.listRecentAuditEventsForLaunch(
      launch.workspaceId,
      launch.id,
      limit
    );
    return {
      launch,
      events
    };
  }

  private async findLaunchFromContext(
    workspaceId: string,
    context: AppContextSnapshot | undefined
  ): Promise<LaunchRecord | undefined> {
    if (!context?.channelId || !context.threadTs) {
      return undefined;
    }

    return this.dependencies.repository.findByThread({
      workspaceId,
      sourceChannelId: context.channelId,
      sourceThreadTs: context.threadTs
    });
  }

  private async refreshCanvas(client: WebClient, launch: LaunchRecord): Promise<void> {
    const auditEvents = await this.dependencies.workspaceAdminService.listRecentAuditEventsForLaunch(
      launch.workspaceId,
      launch.id,
      8
    );
    const markdown = buildLaunchCanvasMarkdown(launch, auditEvents);
    const canvas = await this.dependencies.canvasGateway.createOrUpdate(
      client,
      launch.id,
      launch.canvasId,
      markdown,
      `Launch brief: ${launch.name}`
    );

    launch.canvasId = canvas.canvasId;
    launch.canvasLinkLabel = canvas.label;
  }

  private async persistLaunchWithCanvas(client: WebClient, launch: LaunchRecord): Promise<LaunchRecord> {
    await this.refreshCanvas(client, launch);
    return this.dependencies.repository.save(launch);
  }
}

function buildThreadOnlySearchContext(): SearchContextResult {
  return {
    evidence: [],
    diagnostics: {
      status: "unavailable",
      note: "Live search is disabled for this workspace, so GoSignal used thread evidence only.",
      resultCount: 0,
      messageCount: 0,
      fileCount: 0,
      channelCount: 0
    }
  };
}
