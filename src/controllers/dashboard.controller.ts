import { Context } from "hono";
import { DashboardService } from "../services/dashboard.service.js";

export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  async getDashboard(c: Context): Promise<Response> {
    const data = await this.dashboardService.getDashboard(c.get("userId"));
    return c.json(data);
  }
}
