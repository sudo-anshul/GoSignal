import type { WebClient } from "@slack/web-api";
import type { SearchEvidenceRecord, SearchRequest, SlackMessageRecord } from "../domain/types.ts";

export interface ThreadSource {
  fetchThread(client: WebClient, channelId: string, threadTs: string): Promise<SlackMessageRecord[]>;
}

export interface SearchSource {
  searchPublicContext(client: WebClient, request: SearchRequest): Promise<SearchEvidenceRecord[]>;
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
  async searchPublicContext(client: WebClient, request: SearchRequest): Promise<SearchEvidenceRecord[]> {
    if (!request.actionToken) {
      return [];
    }

    try {
      const response = (await client.apiCall("assistant.search.context", {
        query: request.query,
        action_token: request.actionToken
      })) as unknown as Record<string, unknown>;
      const collections = flattenSearchCollections(response);

      return collections
        .map((item, index) => normalizeSearchItem(item, index))
        .filter((item): item is SearchEvidenceRecord => item !== undefined);
    } catch {
      return [];
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
  const title = typeof record.title === "string" ? record.title : `Search evidence ${index + 1}`;
  const sourceType = typeof record.filetype === "string" ? "search_file" : channelId ? "search_message" : "search_channel";

  return {
    id: typeof record.id === "string" ? record.id : `search-${index}`,
    sourceType,
    title,
    text,
    permalink,
    channelId,
    messageTs: typeof record.ts === "string" ? record.ts : undefined,
    createdAt: typeof record.created_at === "string" ? record.created_at : undefined,
    rawScore: typeof record.score === "number" ? record.score : undefined
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
