import { Hono } from "hono";
import type { KycController } from "../controllers/kyc.controller";
import { requireAuth } from "../middlewares/auth.middleware";

export function createKycRoutes(kycController: KycController): Hono {
  const routes = new Hono();
  routes.get("/status", requireAuth, (c) => kycController.getStatus(c));
  routes.put("/step", requireAuth, (c) => kycController.submitStep(c));
  routes.post("/step/back", requireAuth, (c) => kycController.goBack(c));
  return routes;
}
