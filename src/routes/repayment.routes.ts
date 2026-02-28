import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { RepaymentController } from "../controllers/repayment.controller.js";

export function createRepaymentRoutes(repaymentController: RepaymentController): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.post("/", (c) => repaymentController.recordRepayment(c));
  return routes;
}
