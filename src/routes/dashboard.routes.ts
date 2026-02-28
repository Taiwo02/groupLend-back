import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware";
import type { DashboardController } from "../controllers/dashboard.controller";

type OnboardingMiddleware = (
  c: import("hono").Context,
  next: () => Promise<void>
) => Promise<void>;

export function createDashboardRoutes(
  dashboardController: DashboardController,
  requireOnboardingComplete: OnboardingMiddleware
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.get("/", requireOnboardingComplete, (c) => dashboardController.getDashboard(c));
  return routes;
}
