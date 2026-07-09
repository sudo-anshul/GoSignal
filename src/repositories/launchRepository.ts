import type { LaunchRecord, LaunchKey } from "../domain/types.ts";

export interface LaunchRepository {
  save(launch: LaunchRecord): Promise<LaunchRecord>;
  findByThread(key: LaunchKey): Promise<LaunchRecord | undefined>;
  findById(id: string): Promise<LaunchRecord | undefined>;
  listRecentForWorkspace(workspaceId: string, limit?: number): Promise<LaunchRecord[]>;
  findLatestByUser(workspaceId: string, userId: string): Promise<LaunchRecord | undefined>;
  searchByName(workspaceId: string, query: string, limit?: number): Promise<LaunchRecord[]>;
}
