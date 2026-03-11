import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { AdminDashboardController } from "../controllers/admin-dashboard.controller.js";
import type { AdminKycController } from "../controllers/admin-kyc.controller.js";

export function createAdminRoutes(
  adminDashboardController: AdminDashboardController,
  adminKycController: AdminKycController
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);

  routes.get("/dashboard", (c) => adminDashboardController.getDashboard(c));
  routes.get("/search", (c) => adminDashboardController.search(c));
  routes.get("/kyc/count", (c) => adminKycController.getKycCount(c));
  routes.get("/kyc", (c) => adminKycController.getKycList(c));

  return routes;
}
