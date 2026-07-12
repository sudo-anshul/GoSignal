import type { App } from "@slack/bolt";
import type { ContextStore } from "../repositories/contextStore.ts";
import type { LaunchService } from "../services/launchService.ts";
import type { HomeService } from "../services/homeService.ts";
import { buildDmReplyBlocks, buildLaunchBlocks, buildSignoffRequestText } from "../ui/blocks.ts";
import { buildWorkspaceSettingsModal } from "../ui/appHome.ts";
import { LAUNCH_PROFILE_DEFINITIONS } from "../domain/constants.ts";
import type { AppContextSnapshot, LaunchProfileId, LaunchRecord, WorkspaceSearchMode } from "../domain/types.ts";
import type { WorkspaceAdminService } from "../services/workspaceAdminService.ts";
import {
  buildLaunchExportModal,
  buildLaunchHistoryModal,
  buildOwnerAssignmentModal
} from "../ui/launchModals.ts";

interface GoSignalHandlersDependencies {
  contextStore: ContextStore;
  launchService: LaunchService;
  homeService: HomeService;
  workspaceAdminService: WorkspaceAdminService;
}

function extractActionToken(payload: Record<string, unknown>): string | undefined {
  const direct = payload.action_token;
  if (typeof direct === "string") {
    return direct;
  }
  const nested = payload.context;
  if (nested && typeof nested === "object" && typeof (nested as Record<string, unknown>).action_token === "string") {
    return (nested as Record<string, unknown>).action_token as string;
  }
  return undefined;
}

function extractContext(payload: Record<string, unknown>, workspaceId: string, userId: string): AppContextSnapshot {
  const appContext = (payload.app_context as Record<string, unknown> | undefined) ?? payload;
  const channel = appContext.channel as Record<string, unknown> | undefined;
  const message = appContext.message as Record<string, unknown> | undefined;

  return {
    workspaceId,
    userId,
    channelId:
      typeof appContext.channel_id === "string"
        ? appContext.channel_id
        : typeof channel?.id === "string"
          ? channel.id
          : undefined,
    threadTs:
      typeof appContext.thread_ts === "string"
        ? appContext.thread_ts
        : typeof message?.thread_ts === "string"
          ? message.thread_ts
          : typeof message?.ts === "string"
            ? message.ts
            : undefined,
    entityType: typeof appContext.type === "string" ? appContext.type : undefined,
    seenAt: new Date().toISOString()
  };
}

function extractActionThreadTarget(payload: Record<string, unknown>): { channelId?: string; threadTs?: string; userId?: string } {
  const container = payload.container as Record<string, unknown> | undefined;
  const channel = payload.channel as Record<string, unknown> | undefined;
  const message = payload.message as Record<string, unknown> | undefined;
  const user = payload.user as Record<string, unknown> | undefined;

  return {
    channelId:
      typeof container?.channel_id === "string"
        ? container.channel_id
        : typeof channel?.id === "string"
          ? channel.id
          : undefined,
    threadTs:
      typeof container?.thread_ts === "string"
        ? container.thread_ts
        : typeof message?.thread_ts === "string"
          ? message.thread_ts
          : typeof container?.message_ts === "string"
            ? container.message_ts
            : typeof message?.ts === "string"
              ? message.ts
              : undefined,
    userId: typeof user?.id === "string" ? user.id : undefined
  };
}

function parseActionValue(value: unknown): { launchId?: string; roleName?: string } {
  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      launchId: typeof parsed.launchId === "string" ? parsed.launchId : undefined,
      roleName: typeof parsed.roleName === "string" ? parsed.roleName : undefined
    };
  } catch {
    return {
      launchId: value
    };
  }
}

async function resolveLaunchFromAction(
  client: any,
  payload: Record<string, unknown>,
  workspaceId: string | undefined,
  launchService: LaunchService
): Promise<LaunchRecord | undefined> {
  const action = Array.isArray(payload.actions) ? payload.actions[0] as Record<string, unknown> | undefined : undefined;
  const launchId = action ? parseActionValue(action.value).launchId : undefined;

  if (launchId) {
    const existingLaunch = await launchService.getLaunchById(launchId);
    if (existingLaunch) {
      return existingLaunch;
    }
  }

  if (!workspaceId) {
    return undefined;
  }

  const actionTarget = extractActionThreadTarget(payload);
  if (!actionTarget.channelId || !actionTarget.threadTs || !actionTarget.userId) {
    return undefined;
  }

  return launchService.analyzeThread(client, {
    workspaceId,
    sourceChannelId: actionTarget.channelId,
    sourceThreadTs: actionTarget.threadTs,
    userId: actionTarget.userId,
    actionToken: extractActionToken(payload)
  });
}

function extractWorkspaceId(payload: Record<string, unknown>, fallback: string | undefined): string | undefined {
  if (fallback) {
    return fallback;
  }

  const team = payload.team;
  if (team && typeof team === "object" && typeof (team as Record<string, unknown>).id === "string") {
    return (team as Record<string, unknown>).id as string;
  }

  return undefined;
}

function extractUserId(payload: Record<string, unknown>): string | undefined {
  const user = payload.user;
  if (user && typeof user === "object" && typeof (user as Record<string, unknown>).id === "string") {
    return (user as Record<string, unknown>).id as string;
  }
  return undefined;
}

function parseWorkspaceSettingsSubmission(values: Record<string, unknown>): {
  searchMode?: WorkspaceSearchMode;
  auditRetentionDays?: number;
  defaultLaunchProfile?: LaunchProfileId;
} {
  const searchModeBlock = values.search_mode as Record<string, unknown> | undefined;
  const searchModeValue = searchModeBlock?.value as Record<string, unknown> | undefined;
  const selectedOption = searchModeValue?.selected_option as Record<string, unknown> | undefined;
  const searchMode =
    selectedOption?.value === "thread_only" || selectedOption?.value === "public_only"
      ? (selectedOption.value as WorkspaceSearchMode)
      : undefined;

  const retentionBlock = values.audit_retention_days as Record<string, unknown> | undefined;
  const retentionValue = retentionBlock?.value as Record<string, unknown> | undefined;
  const rawRetentionDays = typeof retentionValue?.value === "string" ? retentionValue.value.trim() : "";
  const auditRetentionDays = rawRetentionDays ? Number(rawRetentionDays) : undefined;
  const profileBlock = values.default_launch_profile as Record<string, unknown> | undefined;
  const profileValue = profileBlock?.value as Record<string, unknown> | undefined;
  const selectedProfile = profileValue?.selected_option as Record<string, unknown> | undefined;
  const defaultLaunchProfile =
    typeof selectedProfile?.value === "string" && selectedProfile.value in LAUNCH_PROFILE_DEFINITIONS
      ? (selectedProfile.value as LaunchProfileId)
      : undefined;

  return {
    searchMode,
    auditRetentionDays,
    defaultLaunchProfile
  };
}

function parseOwnerAssignmentSubmission(values: Record<string, unknown>): { roleName?: string; ownerUserId?: string } {
  const roleBlock = values.role_name as Record<string, unknown> | undefined;
  const roleValue = roleBlock?.value as Record<string, unknown> | undefined;
  const selectedRole = roleValue?.selected_option as Record<string, unknown> | undefined;

  const ownerBlock = values.owner_user as Record<string, unknown> | undefined;
  const ownerValue = ownerBlock?.value as Record<string, unknown> | undefined;

  return {
    roleName: typeof selectedRole?.value === "string" ? selectedRole.value : undefined,
    ownerUserId: typeof ownerValue?.selected_user === "string" ? ownerValue.selected_user : undefined
  };
}

export function registerHandlers(app: App, dependencies: GoSignalHandlersDependencies): void {
  app.event("app_home_opened", async (args) => {
    const { event, client, context, logger } = args as any;
    try {
      if (!context.teamId) {
        return;
      }
      await dependencies.homeService.publish(client, context.teamId, event.user);
    } catch (error) {
      logger.error(error);
    }
  });

  app.event("app_context_changed", async (args) => {
    const { event, context, logger } = args as any;
    try {
      if (!context.teamId) {
        return;
      }
      const payload = event as unknown as Record<string, unknown>;
      const userId = typeof payload.user === "string" ? payload.user : undefined;
      if (!userId) {
        return;
      }
      await dependencies.contextStore.set(extractContext(payload, context.teamId, userId));
    } catch (error) {
      logger.error(error);
    }
  });

  app.event("app_mention", async (args) => {
    const { event, client, context, logger, body } = args as any;
    try {
      if (!context.teamId) {
        return;
      }
      const actionToken = extractActionToken(body as Record<string, unknown>);
      const launch = await dependencies.launchService.analyzeThread(client, {
        workspaceId: context.teamId,
        sourceChannelId: event.channel,
        sourceThreadTs: event.thread_ts ?? event.ts,
        userId: event.user,
        actionToken
      });
      const responseText = await dependencies.launchService.answerLaunchQuestion(launch, event.text);

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        text: responseText,
        blocks: buildLaunchBlocks(launch, responseText) as never
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.shortcut("analyze_launch_readiness", async (args) => {
    const { shortcut, ack, client, context, logger, body } = args as any;
    await ack();

    try {
      if (!context.teamId) {
        return;
      }

      const channelId = shortcut.channel?.id;
      const messageTs = shortcut.message?.thread_ts ?? shortcut.message?.ts;
      if (!channelId || !messageTs) {
        return;
      }

      const actionToken = extractActionToken(body as Record<string, unknown>);
      const launch = await dependencies.launchService.analyzeThread(client, {
        workspaceId: context.teamId,
        sourceChannelId: channelId,
        sourceThreadTs: messageTs,
        userId: shortcut.user.id,
        actionToken
      });

      await client.chat.postMessage({
        channel: channelId,
        thread_ts: messageTs,
        text: launch.decision.summary,
        blocks: buildLaunchBlocks(launch) as never
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.event("message", async (args) => {
    const { event, client, context, logger } = args as any;
    try {
      const payload = event as Record<string, unknown>;
      if (!context.teamId || payload.channel_type !== "im" || typeof payload.user !== "string" || typeof payload.text !== "string") {
        return;
      }
      if (typeof payload.bot_id === "string") {
        return;
      }

      const snapshotFromEvent = (payload.app_context && typeof payload.app_context === "object")
        ? extractContext(payload, context.teamId, payload.user)
        : await dependencies.contextStore.get(context.teamId, payload.user);
      if (snapshotFromEvent && "seenAt" in snapshotFromEvent) {
        await dependencies.contextStore.set(snapshotFromEvent);
      }

      const launch = await dependencies.launchService.resolveLaunchForDmQuery({
        workspaceId: context.teamId,
        userId: payload.user,
        query: payload.text,
        context: snapshotFromEvent
      });

      if (!launch) {
        await client.chat.postMessage({
          channel: String(payload.channel),
          text: "GoSignal can answer about an existing launch after you analyze a thread. Use the message shortcut on a launch thread or mention @GoSignal in that thread first."
        });
        return;
      }

      const answerText = await dependencies.launchService.answerLaunchQuestion(launch, payload.text);

      await client.chat.postMessage({
        channel: String(payload.channel),
        thread_ts: typeof payload.thread_ts === "string" ? payload.thread_ts : String(payload.ts),
        text: answerText,
        blocks: buildDmReplyBlocks(launch, answerText) as never
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_rerun", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const actionToken = extractActionToken(payload);
      const action = Array.isArray(body.actions) ? body.actions[0] : undefined;
      const launchId = action && typeof action.value === "string" ? action.value : undefined;
      const launch = launchId
        ? (await dependencies.launchService.rerunLaunch(client, launchId, actionToken)) ??
          (await resolveLaunchFromAction(client, payload, context.teamId, dependencies.launchService))
        : await resolveLaunchFromAction(client, payload, context.teamId, dependencies.launchService);
      if (!launch) {
        return;
      }

      await client.chat.postMessage({
        channel: launch.sourceChannelId,
        thread_ts: launch.sourceThreadTs,
        text: launch.decision.summary,
        blocks: buildLaunchBlocks(launch) as never
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_request_signoff", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const launch = await resolveLaunchFromAction(client, payload, workspaceId, dependencies.launchService);
      if (!launch) {
        return;
      }

      await client.chat.postMessage({
        channel: launch.sourceChannelId,
        thread_ts: launch.sourceThreadTs,
        text: buildSignoffRequestText(launch)
      });

      if (workspaceId && userId) {
        await dependencies.workspaceAdminService.recordEvent({
          workspaceId,
          actorUserId: userId,
          eventType: "signoff_requested",
          summary: `Requested the missing sign-off for ${launch.name}.`,
          launchId: launch.id
        });
      }
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_open_canvas", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const launch = await resolveLaunchFromAction(client, payload, workspaceId, dependencies.launchService);
      if (!launch) {
        return;
      }

      await client.chat.postMessage({
        channel: launch.sourceChannelId,
        thread_ts: launch.sourceThreadTs,
        text: launch.canvasId
          ? `Launch brief ready: ${launch.canvasLinkLabel ?? launch.canvasId}`
          : "The launch brief canvas has not been created yet."
      });

      if (workspaceId && userId) {
        await dependencies.workspaceAdminService.recordEvent({
          workspaceId,
          actorUserId: userId,
          eventType: "canvas_opened",
          summary: `Opened the launch brief for ${launch.name}.`,
          launchId: launch.id
        });
      }
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_open_launch", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const launch = await resolveLaunchFromAction(client, payload, workspaceId, dependencies.launchService);
      if (!launch) {
        return;
      }
      await client.chat.postMessage({
        channel: launch.sourceChannelId,
        thread_ts: launch.sourceThreadTs,
        text: launch.decision.summary,
        blocks: buildLaunchBlocks(launch) as never
      });

      if (workspaceId && userId) {
        await dependencies.workspaceAdminService.recordEvent({
          workspaceId,
          actorUserId: userId,
          eventType: "launch_opened",
          summary: `Opened the latest readiness board for ${launch.name}.`,
          launchId: launch.id
        });
      }
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_assign_owner", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const triggerId = typeof body.trigger_id === "string" ? body.trigger_id : undefined;
      if (!workspaceId || !triggerId) {
        return;
      }

      const launch = await resolveLaunchFromAction(client, payload, workspaceId, dependencies.launchService);
      if (!launch) {
        return;
      }

      await client.views.open({
        trigger_id: triggerId,
        view: buildOwnerAssignmentModal(launch)
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_remind_owner", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const action = Array.isArray(payload.actions) ? payload.actions[0] as Record<string, unknown> | undefined : undefined;
      const actionValue = parseActionValue(action?.value);
      const launch = await resolveLaunchFromAction(client, payload, workspaceId, dependencies.launchService);
      if (!launch) {
        return;
      }

      const roleName =
        actionValue.roleName ?? launch.approvals.find((approval) => approval.state !== "approved")?.roleName;
      if (!roleName) {
        return;
      }

      const reminderText = dependencies.launchService.buildOwnerReminderText(launch, roleName);
      await client.chat.postMessage({
        channel: launch.sourceChannelId,
        thread_ts: launch.sourceThreadTs,
        text: reminderText
      });

      if (userId) {
        await dependencies.launchService.recordOwnerReminder(client, launch.id, roleName, userId);
      }

      if (workspaceId && userId) {
        await dependencies.homeService.publish(client, workspaceId, userId);
      }
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_view_history", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const triggerId = typeof body.trigger_id === "string" ? body.trigger_id : undefined;
      if (!workspaceId || !userId || !triggerId) {
        return;
      }

      const launchHistory = await dependencies.launchService.getLaunchHistory(
        parseActionValue((Array.isArray(payload.actions) ? payload.actions[0] : undefined)?.value).launchId ?? ""
      );
      if (!launchHistory) {
        return;
      }

      await client.views.open({
        trigger_id: triggerId,
        view: buildLaunchHistoryModal(launchHistory.launch, launchHistory.events)
      });

      await dependencies.workspaceAdminService.recordEvent({
        workspaceId,
        actorUserId: userId,
        eventType: "launch_history_viewed",
        summary: `Viewed launch history for ${launchHistory.launch.name}.`,
        launchId: launchHistory.launch.id
      });
      await dependencies.homeService.publish(client, workspaceId, userId);
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_export_brief", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const triggerId = typeof body.trigger_id === "string" ? body.trigger_id : undefined;
      if (!workspaceId || !userId || !triggerId) {
        return;
      }

      const action = Array.isArray(payload.actions) ? payload.actions[0] as Record<string, unknown> | undefined : undefined;
      const exportPayload = await dependencies.launchService.buildLaunchExport(parseActionValue(action?.value).launchId ?? "");
      if (!exportPayload) {
        return;
      }

      await client.views.open({
        trigger_id: triggerId,
        view: buildLaunchExportModal(exportPayload.launch, exportPayload.markdown)
      });

      await dependencies.workspaceAdminService.recordEvent({
        workspaceId,
        actorUserId: userId,
        eventType: "launch_exported",
        summary: `Opened export brief for ${exportPayload.launch.name}.`,
        launchId: exportPayload.launch.id
      });
      await dependencies.homeService.publish(client, workspaceId, userId);
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_refresh_home", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      if (!workspaceId || !userId) {
        return;
      }

      await dependencies.homeService.publish(client, workspaceId, userId);
    } catch (error) {
      logger.error(error);
    }
  });

  app.action("gosignal_open_settings", async (args) => {
    const { ack, body, client, logger, context } = args as any;
    await ack();
    try {
      const payload = body as Record<string, unknown>;
      const workspaceId = extractWorkspaceId(payload, context.teamId);
      const userId = extractUserId(payload);
      const triggerId = typeof body.trigger_id === "string" ? body.trigger_id : undefined;
      if (!workspaceId || !userId || !triggerId) {
        return;
      }

      const settings = await dependencies.workspaceAdminService.getSettings(workspaceId, userId);
      await client.views.open({
        trigger_id: triggerId,
        view: buildWorkspaceSettingsModal(settings)
      });
    } catch (error) {
      logger.error(error);
    }
  });

  app.view("gosignal_assign_owner_submit", async (args) => {
    const { ack, body, client, logger } = args as any;
    let acknowledged = false;
    try {
      const payload = body as Record<string, unknown>;
      const view = payload.view as Record<string, unknown> | undefined;
      const launchId = typeof view?.private_metadata === "string" ? view.private_metadata : undefined;
      const userId = extractUserId(payload);
      const state = view?.state as Record<string, unknown> | undefined;
      const values = state?.values as Record<string, unknown> | undefined;
      const submission = values ? parseOwnerAssignmentSubmission(values) : {};

      if (!launchId || !userId || !submission.roleName || !submission.ownerUserId) {
        await ack({
          response_action: "errors",
          errors: {
            role_name: "Choose the missing sign-off to assign.",
            owner_user: "Choose an owner to follow up on it."
          }
        });
        acknowledged = true;
        return;
      }

      await ack();
      acknowledged = true;

      const updatedLaunch = await dependencies.launchService.assignOwner(
        client,
        launchId,
        submission.roleName,
        submission.ownerUserId,
        userId
      );
      if (!updatedLaunch) {
        return;
      }

      await client.chat.postMessage({
        channel: updatedLaunch.sourceChannelId,
        thread_ts: updatedLaunch.sourceThreadTs,
        text: `Assigned ${submission.roleName} to <@${submission.ownerUserId}> for ${updatedLaunch.name}.`,
        blocks: buildLaunchBlocks(
          updatedLaunch,
          `${updatedLaunch.decision.summary} Assigned ${submission.roleName} to <@${submission.ownerUserId}> for follow-up.`
        ) as never
      });
      await dependencies.homeService.publish(client, updatedLaunch.workspaceId, userId);
    } catch (error) {
      if (!acknowledged) {
        await ack();
      }
      logger.error(error);
    }
  });

  app.view("gosignal_workspace_settings_submit", async (args) => {
    const { ack, body, client, logger } = args as any;
    let acknowledged = false;
    try {
      const payload = body as Record<string, unknown>;
      const view = payload.view as Record<string, unknown> | undefined;
      const workspaceId = typeof view?.private_metadata === "string" ? view.private_metadata : undefined;
      const userId = extractUserId(payload);
      const state = view?.state as Record<string, unknown> | undefined;
      const values = state?.values as Record<string, unknown> | undefined;
      const submission = values ? parseWorkspaceSettingsSubmission(values) : {};

      if (!workspaceId || !userId || !submission.searchMode || !submission.auditRetentionDays || !submission.defaultLaunchProfile) {
        await ack({
          response_action: "errors",
          errors: {
            search_mode: "Choose a search mode for this workspace.",
            default_launch_profile: "Choose a default launch profile for this workspace.",
            audit_retention_days: "Enter a retention value between 1 and 365 days."
          }
        });
        acknowledged = true;
        return;
      }

      if (!Number.isInteger(submission.auditRetentionDays) || submission.auditRetentionDays < 1 || submission.auditRetentionDays > 365) {
        await ack({
          response_action: "errors",
          errors: {
            audit_retention_days: "Audit retention must be a whole number between 1 and 365."
          }
        });
        acknowledged = true;
        return;
      }

      await ack();
      acknowledged = true;
      await dependencies.workspaceAdminService.updateSettings({
        workspaceId,
        updatedByUserId: userId,
        searchMode: submission.searchMode,
        auditRetentionDays: submission.auditRetentionDays,
        defaultLaunchProfile: submission.defaultLaunchProfile
      });
      await dependencies.homeService.publish(client, workspaceId, userId);
    } catch (error) {
      if (!acknowledged) {
        await ack();
      }
      logger.error(error);
    }
  });
}
