import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { AdminDashboardController } from "../controllers/admin-dashboard.controller.js";

export function createAdminRoutes(adminDashboardController: AdminDashboardController): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);

  routes.get("/dashboard", (c) => adminDashboardController.getDashboard(c));
  routes.get("/search", (c) => adminDashboardController.search(c));

  return routes;
}
