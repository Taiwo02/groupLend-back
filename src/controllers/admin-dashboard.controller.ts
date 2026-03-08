import { Context } from "hono";
import { AdminDashboardService } from "../services/admin-dashboard.service.js";

export class AdminDashboardController {
  constructor(private readonly adminDashboardService: AdminDashboardService) {}

  async getDashboard(c: Context): Promise<Response> {
    const data = await this.adminDashboardService.getDashboard();
    return c.json(data);
  }

  async search(c: Context): Promise<Response> {
    const q = c.req.query("q") ?? "";
    const limit = Math.min(Number(c.req.query("limit")) || 20, 50);
    const data = await this.adminDashboardService.search(q, limit);
    return c.json(data);
  }
}
