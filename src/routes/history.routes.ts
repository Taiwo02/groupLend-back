import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { HistoryController } from "../controllers/history.controller.js";

export function createHistoryRoutes(historyController: HistoryController): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.post("/", (c) => historyController.getHistory(c));
  return routes;
}
