import { Hono } from "hono";
import type { AuthController } from "../controllers/auth.controller.js";
import type { InvitationController } from "../controllers/invitation.controller.js";
import { optionalAuth, requireAuth } from "../middlewares/auth.middleware.js";

export function createAuthRoutes(
  authController: AuthController,
  invitationController: InvitationController
): Hono {
  const routes = new Hono();
  routes.post("/signup", (c) => authController.signup(c));
  routes.post("/login", (c) => authController.login(c));
  routes.post("/verify-email", (c) => authController.verifyEmail(c));
  routes.get("/profile", requireAuth, (c) => authController.getProfile(c));
  routes.post("/forget-password", (c) => authController.forgetPassword(c));
  routes.post("/set-password", (c) => authController.setPassword(c));
  routes.post("/change-password", requireAuth, (c) => authController.changePassword(c));
  routes.get("/member-invitation/:token", (c) => invitationController.getInvitation(c));
  routes.post("/member-invitation/:token/accept", optionalAuth, (c) => invitationController.acceptInvitation(c));
  routes.post("/member-invitation/:token/reject", (c) => invitationController.rejectInvitation(c));
  routes.post("/income", requireAuth, (c) => authController.submitIncome(c));
  routes.post("/pin", requireAuth, (c) => authController.setLoanPin(c));
  return routes;
}
