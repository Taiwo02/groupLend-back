import { Hono } from "hono";
import type { NinController } from "../controllers/nin.controller.js";
import { requireAuth } from "../middlewares/auth.middleware.js";

export function createNinRoutes(ninController: NinController): Hono {
  const routes = new Hono();
  routes.post("/lookup", requireAuth, (c) => ninController.lookup(c));
  routes.post("/verify", requireAuth, (c) => ninController.verify(c));
  return routes;
}
