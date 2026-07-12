import type { WebClient } from "@slack/web-api";
import type {
  SearchContextResult,
  SearchDiagnostics,
  SearchEvidenceRecord,
  SearchRequest,
  SlackMessageRecord
} from "../domain/types.ts";

export interface ThreadSource {
  fetchThread(client: WebClient, channelId: string, threadTs: string): Promise<SlackMessageRecord[]>;
}

export interface SearchSource {
  searchPublicContext(client: WebClient, request: SearchRequest): Promise<SearchContextResult>;
}

export interface CanvasGateway {
  createOrUpdate(client: WebClient, launchId: string, canvasId: string | undefined, markdown: string, title: string): Promise<{ canvasId: string; label: string }>;
}

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export class SlackThreadSource implements ThreadSource {
  async fetchThread(client: WebClient, channelId: string, threadTs: string): Promise<SlackMessageRecord[]> {
    const response = await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      limit: 50
    });

    return asArray(response.messages).map((message) => {
      const enrichedMessage = message as {
        subtype?: string;
        bot_id?: unknown;
        app_id?: unknown;
        bot_profile?: unknown;
      };

      return {
      channelId,
      threadTs,
      messageTs: String(message.ts),
      userId: typeof message.user === "string" ? message.user : undefined,
      isBotMessage:
        enrichedMessage.subtype === "bot_message" ||
        typeof enrichedMessage.bot_id === "string" ||
        typeof enrichedMessage.app_id === "string" ||
        typeof enrichedMessage.bot_profile === "object",
      text: typeof message.text === "string" ? message.text : "",
      createdAt: message.ts ? new Date(Number(message.ts.split(".")[0]) * 1_000).toISOString() : new Date().toISOString()
      };
    });
  }
}

function flattenSearchCollections(payload: Record<string, unknown>): unknown[] {
  const results = payload.results;
  if (results && typeof results === "object") {
    const container = results as Record<string, unknown>;
    return [
      ...asArray(container.messages as unknown[]),
      ...asArray(container.files as unknown[]),
      ...asArray(container.channels as unknown[])
    ];
  }

  return [
    ...asArray(payload.messages as unknown[]),
    ...asArray(payload.files as unknown[]),
    ...asArray(payload.channels as unknown[])
  ];
}

export class SlackSearchSource implements SearchSource {
  async searchPublicContext(client: WebClient, request: SearchRequest): Promise<SearchContextResult> {
    if (!request.actionToken) {
      return {
        evidence: [],
        diagnostics: buildDiagnostics(
          "unavailable",
          "Live search unavailable for this run because Slack did not provide an action token. Use the thread shortcut or mention GoSignal in-thread to add cross-channel evidence.",
          []
        )
      };
    }

    try {
      const response = (await client.apiCall("assistant.search.context", {
        query: request.query,
        action_token: request.actionToken
      })) as unknown as Record<string, unknown>;
      const collections = flattenSearchCollections(response);
      const evidence = collections
        .map((item, index) => normalizeSearchItem(item, index))
        .filter((item): item is SearchEvidenceRecord => item !== undefined);

      return {
        evidence,
        diagnostics:
          evidence.length > 0
            ? buildDiagnostics(
                "used",
                `Live search added ${evidence.length} public evidence item${evidence.length === 1 ? "" : "s"} from outside the current thread.`,
                evidence
              )
            : buildDiagnostics(
                "empty",
                "Live search ran for this thread but did not find additional public Slack evidence for the current launch.",
                evidence
              )
      };
    } catch {
      return {
        evidence: [],
        diagnostics: buildDiagnostics(
          "unavailable",
          "Live search was unavailable for this run, so GoSignal fell back to thread evidence only.",
          []
        )
      };
    }
  }
}

function normalizeSearchItem(item: unknown, index: number): SearchEvidenceRecord | undefined {
  if (!item || typeof item !== "object") {
    return undefined;
  }

  const record = item as Record<string, unknown>;
  const text = typeof record.text === "string" ? record.text : typeof record.summary === "string" ? record.summary : "";
  const permalink = typeof record.permalink === "string" ? record.permalink : undefined;
  const channel = record.channel as Record<string, unknown> | undefined;
  const channelId = typeof channel?.id === "string" ? channel.id : undefined;
  const channelName =
    typeof channel?.name === "string"
      ? channel.name
      : typeof record.channel_name === "string"
        ? record.channel_name
        : undefined;
  const sourceType = typeof record.filetype === "string" ? "search_file" : channelId ? "search_message" : "search_channel";
  const title =
    typeof record.title === "string"
      ? record.title
      : sourceType === "search_message"
        ? `Live search message ${index + 1}`
        : sourceType === "search_file"
          ? `Live search file ${index + 1}`
          : `Live search channel ${index + 1}`;

  return {
    id: typeof record.id === "string" ? record.id : `search-${index}`,
    sourceType,
    title,
    text,
    permalink,
    channelId,
    channelName,
    messageTs: normalizeSearchTimestamp(record.ts),
    createdAt: normalizeSearchTimestamp(record.created_at),
    rawScore: typeof record.score === "number" ? record.score : undefined
  };
}

function normalizeSearchTimestamp(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value * (value > 10_000_000_000 ? 1 : 1_000)).toISOString();
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const numericValue = Number(trimmed);
  if (!Number.isNaN(numericValue)) {
    return new Date(numericValue * (trimmed.includes(".") || numericValue < 10_000_000_000 ? 1_000 : 1)).toISOString();
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : new Date(parsed).toISOString();
}

function buildDiagnostics(status: SearchDiagnostics["status"], note: string, evidence: SearchEvidenceRecord[]): SearchDiagnostics {
  const messageCount = evidence.filter((item) => item.sourceType === "search_message").length;
  const fileCount = evidence.filter((item) => item.sourceType === "search_file").length;
  const channelCount = evidence.filter((item) => item.sourceType === "search_channel").length;

  return {
    status,
    note,
    resultCount: evidence.length,
    messageCount,
    fileCount,
    channelCount
  };
}

export class SlackCanvasGateway implements CanvasGateway {
  async createOrUpdate(
    client: WebClient,
    launchId: string,
    canvasId: string | undefined,
    markdown: string,
    title: string
  ): Promise<{ canvasId: string; label: string }> {
    const documentContent = {
      type: "markdown",
      markdown
    };

    if (canvasId) {
      await client.apiCall("canvases.edit", {
        canvas_id: canvasId,
        changes: [
          {
            operation: "replace",
            document_content: documentContent
          }
        ]
      });

      return {
        canvasId,
        label: `canvas:${canvasId}`
      };
    }

    const response = (await client.apiCall("canvases.create", {
      title,
      document_content: documentContent
    })) as unknown as Record<string, unknown>;
    const createdCanvasId = typeof response.canvas_id === "string" ? response.canvas_id : `${launchId}-canvas`;
    return {
      canvasId: createdCanvasId,
      label: `canvas:${createdCanvasId}`
    };
  }
}
