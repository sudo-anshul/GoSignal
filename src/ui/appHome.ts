import type { View } from "@slack/types";
import type { LaunchRecord } from "../domain/types.ts";

function launchSection(launch: LaunchRecord): Record<string, unknown>[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*${launch.name}*\nState: *${launch.decision.overallState}* · Confidence: *${launch.decision.confidence}*\n${launch.decision.summary}`
      }
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
        }
      ]
    },
    {
      type: "divider"
    }
  ];
}

export function buildAppHomeView(launches: LaunchRecord[]): View {
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
        text: "Analyze public launch threads, build a durable launch brief, and keep your go/no-go decision grounded in evidence."
      }
    },
    {
      type: "divider"
    }
  ];

  if (launches.length === 0) {
    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: "No launches yet. Use the *Analyze launch readiness* message shortcut or mention GoSignal in a launch thread."
      }
    });
  } else {
    for (const launch of launches) {
      blocks.push(...launchSection(launch));
    }
  }

  return {
    type: "home",
    blocks
  } as unknown as View;
}
