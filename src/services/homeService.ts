import type { WebClient } from "@slack/web-api";
import type { LaunchService } from "./launchService.ts";
import { buildAppHomeView } from "../ui/appHome.ts";
import { WorkspaceAdminService } from "./workspaceAdminService.ts";

interface HomeServiceDependencies {
  launchService: LaunchService;
  workspaceAdminService: WorkspaceAdminService;
  responseMode: string;
}

export class HomeService {
  private readonly launchService: LaunchService;
  private readonly workspaceAdminService: WorkspaceAdminService;
  private readonly responseMode: string;

  constructor(dependencies: HomeServiceDependencies) {
    this.launchService = dependencies.launchService;
    this.workspaceAdminService = dependencies.workspaceAdminService;
    this.responseMode = dependencies.responseMode;
  }

  async publish(client: WebClient, workspaceId: string, userId: string): Promise<void> {
    const launches = await this.launchService.listRecentLaunches(workspaceId, 8);
    const settings = await this.workspaceAdminService.getSettings(workspaceId, userId);
    const auditEvents = await this.workspaceAdminService.listRecentAuditEvents(workspaceId, 5);

    await client.views.publish({
      user_id: userId,
      view: buildAppHomeView({
        launches,
        settings,
        auditEvents,
        responseMode: this.responseMode
      })
    });
  }
}
