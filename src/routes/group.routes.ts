import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware.js";
import type { GroupController } from "../controllers/group.controller.js";
import type { DirectDebitMandateController } from "../controllers/direct-debit-mandate.controller.js";

export function createGroupRoutes(
  groupController: GroupController,
  directDebitMandateController: DirectDebitMandateController
): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.post("/", (c) => groupController.createGroup(c));
  routes.get("/:groupId/direct-debit-mandate", (c) => directDebitMandateController.getMandate(c));
  routes.post("/:groupId/direct-debit-mandate", (c) => directDebitMandateController.createMandate(c));
  routes.post("/:groupId/direct-debit-mandate/:mandateId/authorize", (c) => directDebitMandateController.authorizeMandate(c));
  routes.post("/:groupId/direct-debit-mandate/:mandateId/confirm", (c) => directDebitMandateController.confirmMandate(c));
  routes.post("/:id/invite", (c) => groupController.inviteMembers(c));
  routes.get("/:id", (c) => groupController.getGroup(c));
  routes.post("/:id/exit", (c) => groupController.requestExit(c));
  routes.post("/:id/exit/final", (c) => groupController.finalExit(c));
  return routes;
}
