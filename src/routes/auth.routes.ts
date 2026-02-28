import { Hono } from "hono";
import type { AuthController } from "../controllers/auth.controller";
import { requireAuth } from "../middlewares/auth.middleware";

export function createAuthRoutes(authController: AuthController): Hono {
  const routes = new Hono();
  routes.post("/signup", (c) => authController.signup(c));
  routes.post("/login", (c) => authController.login(c));
  routes.post("/income", requireAuth, (c) => authController.submitIncome(c));
  routes.post("/pin", requireAuth, (c) => authController.setLoanPin(c));
  return routes;
}
