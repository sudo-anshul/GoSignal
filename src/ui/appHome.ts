import type { View } from "@slack/types";
import { LAUNCH_PROFILE_DEFINITIONS, titleCaseRole } from "../domain/constants.ts";
import type {
  AuditEventRecord,
  LaunchProfileId,
  LaunchRecord,
  WorkspaceSearchMode,
  WorkspaceSettingsRecord
} from "../domain/types.ts";
import { describeSearchMode } from "../services/workspaceAdminService.ts";

interface AppHomeViewInput {
  launches: LaunchRecord[];
  settings: WorkspaceSettingsRecord;
  auditEvents: AuditEventRecord[];
  responseMode: string;
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? isoString : date.toLocaleString();
}

function summarizeLaunches(launches: LaunchRecord[]): { ready: number; hold: number; active: number; draft: number } {
  return launches.reduce(
    (counts, launch) => {
      counts[launch.status] += 1;
      return counts;
    },
    {
      ready: 0,
      hold: 0,
      active: 0,
      draft: 0
    }
  );
}

function launchProfileLabel(profileId: LaunchProfileId): string {
  return LAUNCH_PROFILE_DEFINITIONS[profileId].label;
}

function launchSection(launch: LaunchRecord): Record<string, unknown>[] {
  const missingApprovals = launch.approvals.filter((approval) => approval.state !== "approved");

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${launch.name}*\n` +
          `State: *${launch.decision.overallState}* · Confidence: *${launch.decision.confidence}* · Profile: *${launchProfileLabel(launch.launchProfile)}*\n` +
          `${launch.decision.summary}`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Updated ${formatTimestamp(launch.updatedAt)}`
        },
        {
          type: "mrkdwn",
          text: `Search: ${launch.searchDiagnostics?.status ?? "not captured"}`
        },
        {
          type: "mrkdwn",
          text:
            missingApprovals.length > 0
              ? `Missing: ${missingApprovals.map((approval) => titleCaseRole(approval.roleName)).join(", ")}`
              : "Missing: none"
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "gosignal_open_launch",
          text: {
            type: "plain_text",
            text: "View launch"
          },
          value: launch.id
        },
        {
          type: "button",
          action_id: "gosignal_rerun",
          text: {
            type: "plain_text",
            text: "Re-run"
          },
          value: launch.id
        },
        {
          type: "button",
          action_id: "gosignal_view_history",
          text: {
            type: "plain_text",
            text: "View history"
          },
          value: launch.id
        },
        {
          type: "button",
          action_id: "gosignal_export_brief",
          text: {
            type: "plain_text",
            text: "Export brief"
          },
          value: launch.id
        }
      ]
    },
    {
      type: "divider"
    }
  ];
}

function auditSection(event: AuditEventRecord): Record<string, unknown> {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${humanizeAuditEventType(event.eventType)}*\n${event.summary}`
    },
    accessory: {
      type: "button",
      action_id: event.launchId ? "gosignal_open_launch" : "gosignal_refresh_home",
      text: {
        type: "plain_text",
        text: event.launchId ? "Open launch" : "Refresh"
      },
      value: event.launchId ?? "refresh_home"
    }
  };
}

function humanizeAuditEventType(eventType: AuditEventRecord["eventType"]): string {
  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function searchModeOption(value: WorkspaceSearchMode, label: string, description: string): Record<string, unknown> {
  return {
    text: {
      type: "plain_text",
      text: label
    },
    value,
    description: {
      type: "plain_text",
      text: description
    }
  };
}

function launchProfileOption(profileId: LaunchProfileId): Record<string, unknown> {
  const profile = LAUNCH_PROFILE_DEFINITIONS[profileId];
  return {
    text: {
      type: "plain_text",
      text: profile.label
    },
    value: profile.id,
    description: {
      type: "plain_text",
      text: profile.description.length > 75 ? `${profile.description.slice(0, 72)}...` : profile.description
    }
  };
}

function buildAtRiskLaunchText(launches: LaunchRecord[]): string {
  const atRiskLaunches = launches.filter((launch) => launch.decision.overallState !== "green").slice(0, 3);
  if (atRiskLaunches.length === 0) {
    return "No at-risk launches in the recent workspace history.";
  }

  return atRiskLaunches
    .map((launch) => `• *${launch.name}* — ${launch.decision.overallState} · ${launch.decision.nextAction}`)
    .join("\n");
}

function buildMissingApprovalsText(launches: LaunchRecord[]): string {
  const items = launches
    .flatMap((launch) =>
      launch.approvals
        .filter((approval) => approval.state !== "approved")
        .map((approval) => ({
          launchName: launch.name,
          roleName: approval.roleName
        }))
    )
    .slice(0, 5);

  if (items.length === 0) {
    return "No missing sign-offs across the recent workspace launches.";
  }

  return items
    .map((item) => `• *${item.launchName}* — ${titleCaseRole(item.roleName)}`)
    .join("\n");
}

export function buildAppHomeView(input: AppHomeViewInput): View {
  const counts = summarizeLaunches(input.launches);
  const blocks: Record<string, unknown>[] = [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "GoSignal"
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "Analyze public launch threads, build a durable launch brief, and keep your go/no-go decision grounded in evidence."
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Response mode*\n${input.responseMode}`
        },
        {
          type: "mrkdwn",
          text: `*Live search mode*\n${describeSearchMode(input.settings.searchMode)}`
        },
        {
          type: "mrkdwn",
          text: `*Default profile*\n${launchProfileLabel(input.settings.defaultLaunchProfile)}`
        },
        {
          type: "mrkdwn",
          text: `*Audit retention*\n${input.settings.auditRetentionDays} days`
        },
        {
          type: "mrkdwn",
          text: `*Settings updated*\n${formatTimestamp(input.settings.updatedAt)}`
        }
      ]
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          action_id: "gosignal_open_settings",
          text: {
            type: "plain_text",
            text: "Workspace settings"
          },
          value: input.settings.workspaceId
        },
        {
          type: "button",
          action_id: "gosignal_refresh_home",
          text: {
            type: "plain_text",
            text: "Refresh"
          },
          value: input.settings.workspaceId
        }
      ]
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*At-risk launches*\n${input.launches.filter((launch) => launch.decision.overallState !== "green").length}`
        },
        {
          type: "mrkdwn",
          text:
            `*Open sign-off gaps*\n${
              input.launches.reduce(
                (count, launch) => count + launch.approvals.filter((approval) => approval.state !== "approved").length,
                0
              )
            }`
        },
        {
          type: "mrkdwn",
          text: `*Recent holds*\n${counts.hold}`
        },
        {
          type: "mrkdwn",
          text: `*Recent launches tracked*\n${input.launches.length}`
        }
      ]
    },
    {
      type: "divider"
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Operator Watchlist"
      }
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Recent ready*\n${counts.ready}`
        },
        {
          type: "mrkdwn",
          text: `*Recent active*\n${counts.active}`
        }
      ]
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*At-risk launches*\n${buildAtRiskLaunchText(input.launches)}`
      }
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Missing sign-offs*\n${buildMissingApprovalsText(input.launches)}`
      }
    },
    {
      type: "divider"
    },
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Recent Launches"
      }
    }
  ];

  if (input.launches.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No launches yet. Use the *Analyze launch readiness* message shortcut or mention GoSignal in a launch thread."
      }
    });
  } else {
    for (const launch of input.launches) {
      blocks.push(...launchSection(launch));
    }
  }

  blocks.push(
    {
      type: "header",
      text: {
        type: "plain_text",
        text: "Recent Audit Events"
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Showing the most recent workspace events within the current ${input.settings.auditRetentionDays}-day audit window.`
        }
      ]
    }
  );

  if (input.auditEvents.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No operator events recorded yet for this workspace."
      }
    });
  } else {
    for (const event of input.auditEvents) {
      blocks.push(
        auditSection(event),
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `Actor: <@${event.actorUserId}> · ${formatTimestamp(event.createdAt)}`
            }
          ]
        },
        {
          type: "divider"
        }
      );
    }
  }

  return {
    type: "home",
    blocks
  } as unknown as View;
}

export function buildWorkspaceSettingsModal(settings: WorkspaceSettingsRecord): View {
  return {
    type: "modal",
    callback_id: "gosignal_workspace_settings_submit",
    private_metadata: settings.workspaceId,
    title: {
      type: "plain_text",
      text: "Workspace settings"
    },
    submit: {
      type: "plain_text",
      text: "Save"
    },
    close: {
      type: "plain_text",
      text: "Cancel"
    },
    blocks: [
      {
        type: "input",
        block_id: "search_mode",
        label: {
          type: "plain_text",
          text: "Evidence search mode"
        },
        element: {
          type: "radio_buttons",
          action_id: "value",
          initial_option: searchModeOption(
            settings.searchMode,
            settings.searchMode === "public_only" ? "Thread + live search" : "Thread only",
            settings.searchMode === "public_only"
              ? "Use the launch thread plus public Slack search when Slack provides an action token."
              : "Use only the current thread and explicitly disable live Slack search for this workspace."
          ),
          options: [
            searchModeOption(
              "public_only",
              "Thread + live search",
              "Use the thread plus public Slack search when Slack provides an action token."
            ),
            searchModeOption(
              "thread_only",
              "Thread only",
              "Disable live Slack search and rely only on the current thread."
            )
          ]
        }
      },
      {
        type: "input",
        block_id: "default_launch_profile",
        label: {
          type: "plain_text",
          text: "Default launch profile"
        },
        element: {
          type: "static_select",
          action_id: "value",
          initial_option: launchProfileOption(settings.defaultLaunchProfile),
          options: Object.keys(LAUNCH_PROFILE_DEFINITIONS).map((profileId) =>
            launchProfileOption(profileId as LaunchProfileId)
          )
        }
      },
      {
        type: "input",
        block_id: "audit_retention_days",
        label: {
          type: "plain_text",
          text: "Audit retention (days)"
        },
        element: {
          type: "plain_text_input",
          action_id: "value",
          initial_value: String(settings.auditRetentionDays),
          placeholder: {
            type: "plain_text",
            text: "30"
          }
        }
      }
    ]
  } as unknown as View;
}
