import type { View } from "@slack/types";
import { LAUNCH_PROFILE_DEFINITIONS, titleCaseRole } from "../domain/constants.ts";
import type { AuditEventRecord, LaunchRecord } from "../domain/types.ts";

type SlackBlock = Record<string, unknown>;

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? isoString : date.toLocaleString();
}

function humanizeAuditEventType(eventType: AuditEventRecord["eventType"]): string {
  return eventType
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function chunkText(text: string, limit = 2_600): string[] {
  if (text.length <= limit) {
    return [text];
  }

  const chunks: string[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const end = Math.min(cursor + limit, text.length);
    chunks.push(text.slice(cursor, end));
    cursor = end;
  }
  return chunks;
}

function ownerAssignmentSummary(launch: LaunchRecord): string {
  if (launch.ownerAssignments.length === 0) {
    return "No owner assignments recorded yet.";
  }

  return launch.ownerAssignments
    .map(
      (assignment) =>
        `• ${titleCaseRole(assignment.roleName)} → <@${assignment.userId}> ` +
        `(assigned ${formatTimestamp(assignment.assignedAt)}, reminders ${assignment.reminderCount})`
    )
    .join("\n");
}

export function buildOwnerAssignmentModal(launch: LaunchRecord): View {
  const roleOptions = launch.approvals
    .filter((approval) => approval.state !== "approved")
    .map((approval) => ({
      text: {
        type: "plain_text",
        text: titleCaseRole(approval.roleName)
      },
      value: approval.roleName,
      description: {
        type: "plain_text",
        text: approval.reason.slice(0, 75)
      }
    }));

  const fallbackOptions =
    roleOptions.length > 0
      ? roleOptions
      : launch.approvals.map((approval) => ({
          text: {
            type: "plain_text",
            text: titleCaseRole(approval.roleName)
          },
          value: approval.roleName,
          description: {
            type: "plain_text",
            text: approval.reason.slice(0, 75)
          }
        }));

  return {
    type: "modal",
    callback_id: "gosignal_assign_owner_submit",
    private_metadata: launch.id,
    title: {
      type: "plain_text",
      text: "Assign owner"
    },
    submit: {
      type: "plain_text",
      text: "Assign"
    },
    close: {
      type: "plain_text",
      text: "Cancel"
    },
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text:
            `*${launch.name}*\n` +
            `Profile: *${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}* · ` +
            `State: *${launch.decision.overallState}*`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Current owner assignments*\n${ownerAssignmentSummary(launch)}`
        }
      },
      {
        type: "input",
        block_id: "role_name",
        label: {
          type: "plain_text",
          text: "Missing sign-off"
        },
        element: {
          type: "static_select",
          action_id: "value",
          initial_option: fallbackOptions[0],
          options: fallbackOptions
        }
      },
      {
        type: "input",
        block_id: "owner_user",
        label: {
          type: "plain_text",
          text: "Owner"
        },
        element: {
          type: "users_select",
          action_id: "value",
          placeholder: {
            type: "plain_text",
            text: "Choose a user"
          }
        }
      }
    ]
  } as unknown as View;
}

export function buildLaunchHistoryModal(launch: LaunchRecord, events: AuditEventRecord[]): View {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${launch.name}*\n` +
          `Profile: *${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}* · ` +
          `State: *${launch.decision.overallState}*`
      }
    }
  ];

  if (events.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No launch-specific audit history has been recorded yet."
      }
    });
  } else {
    for (const event of events) {
      blocks.push(
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*${humanizeAuditEventType(event.eventType)}*\n${event.summary}`
          }
        },
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
    type: "modal",
    callback_id: "gosignal_launch_history",
    title: {
      type: "plain_text",
      text: "Launch history"
    },
    close: {
      type: "plain_text",
      text: "Close"
    },
    blocks
  } as unknown as View;
}

export function buildLaunchExportModal(launch: LaunchRecord, markdown: string): View {
  const blocks: SlackBlock[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          `*${launch.name} export*\n` +
          `Profile: *${LAUNCH_PROFILE_DEFINITIONS[launch.launchProfile].label}* · ` +
          `State: *${launch.decision.overallState}*`
      }
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: launch.canvasId
            ? `Canvas reference: ${launch.canvasLinkLabel ?? launch.canvasId}`
            : "Canvas reference: not created yet"
        }
      ]
    }
  ];

  for (const chunk of chunkText(markdown)) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `\`\`\`\n${chunk}\n\`\`\``
      }
    });
  }

  return {
    type: "modal",
    callback_id: "gosignal_launch_export",
    title: {
      type: "plain_text",
      text: "Export brief"
    },
    close: {
      type: "plain_text",
      text: "Close"
    },
    blocks
  } as unknown as View;
}
