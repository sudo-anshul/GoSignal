import type { AppContextSnapshot } from "../domain/types.ts";

export interface ContextStore {
  set(snapshot: AppContextSnapshot): Promise<void>;
  get(workspaceId: string, userId: string): Promise<AppContextSnapshot | undefined>;
}

export class MemoryContextStore implements ContextStore {
  private snapshots = new Map<string, AppContextSnapshot>();

  async set(snapshot: AppContextSnapshot): Promise<void> {
    this.snapshots.set(`${snapshot.workspaceId}:${snapshot.userId}`, snapshot);
  }

  async get(workspaceId: string, userId: string): Promise<AppContextSnapshot | undefined> {
    return this.snapshots.get(`${workspaceId}:${userId}`);
  }
}
