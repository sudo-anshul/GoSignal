import type { WebClient } from "@slack/web-api";
import type { LaunchService } from "./launchService.ts";
import { buildAppHomeView } from "../ui/appHome.ts";

export class HomeService {
  private readonly launchService: LaunchService;

  constructor(launchService: LaunchService) {
    this.launchService = launchService;
  }

  async publish(client: WebClient, workspaceId: string, userId: string): Promise<void> {
    const launches = await this.launchService.listRecentLaunches(workspaceId, 5);
    await client.views.publish({
      user_id: userId,
      view: buildAppHomeView(launches)
    });
  }
}
