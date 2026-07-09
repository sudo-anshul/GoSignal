import type { LaunchRecord, LaunchKey } from "../domain/types.ts";
import type { LaunchRepository } from "./launchRepository.ts";

function threadKey(key: LaunchKey): string {
  return `${key.workspaceId}:${key.sourceChannelId}:${key.sourceThreadTs}`;
}

export class MemoryLaunchRepository implements LaunchRepository {
  private launchesById = new Map<string, LaunchRecord>();
  private launchIdsByThreadKey = new Map<string, string>();

  async save(launch: LaunchRecord): Promise<LaunchRecord> {
    this.launchesById.set(launch.id, launch);
    this.launchIdsByThreadKey.set(threadKey(launch), launch.id);
    return launch;
  }

  async findByThread(key: LaunchKey): Promise<LaunchRecord | undefined> {
    const id = this.launchIdsByThreadKey.get(threadKey(key));
    if (!id) {
      return undefined;
    }
    return this.launchesById.get(id);
  }

  async findById(id: string): Promise<LaunchRecord | undefined> {
    return this.launchesById.get(id);
  }

  async listRecentForWorkspace(workspaceId: string, limit = 10): Promise<LaunchRecord[]> {
    return [...this.launchesById.values()]
      .filter((launch) => launch.workspaceId === workspaceId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, limit);
  }

  async findLatestByUser(workspaceId: string, userId: string): Promise<LaunchRecord | undefined> {
    return [...this.launchesById.values()]
      .filter((launch) => launch.workspaceId === workspaceId && launch.createdByUserId === userId)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))[0];
  }

  async searchByName(workspaceId: string, query: string, limit = 5): Promise<LaunchRecord[]> {
    const normalized = query.toLowerCase();
    return [...this.launchesById.values()]
      .filter((launch) => launch.workspaceId === workspaceId && launch.name.toLowerCase().includes(normalized))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
      .slice(0, limit);
  }
}
