import { Hono } from "hono";
import type { LookupController } from "../controllers/lookup.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export function createLookupRoutes(lookupController: LookupController): Hono {
  const routes = new Hono();
  routes.get("/banks", requireAuth, (c) => lookupController.bankList(c));
  routes.post("/account", requireAuth, (c) => lookupController.verifyAccount(c));
  return routes;
}
