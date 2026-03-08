import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { DashboardController } from "../controllers/dashboard.controller.js";

export function createDashboardRoutes(dashboardController: DashboardController): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.get("/", (c) => dashboardController.getDashboard(c));
  return routes;
}
