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
  routes.get("/:groupId/direct-debit-mandate/accounts", (c) =>
    directDebitMandateController.listSavedAccounts(c)
  );
  routes.post("/:groupId/direct-debit-mandate", (c) =>
    directDebitMandateController.createAndAuthorizeMandate(c)
  );
  routes.post("/:groupId/direct-debit-mandate/accounts/:accountId/verify", (c) =>
    directDebitMandateController.verifyAccountMandate(c)
  );
  routes.post("/:groupId/direct-debit-mandate/accounts/:accountId", (c) =>
    directDebitMandateController.getOrRefreshAccountMandate(c)
  );
  routes.post("/:groupId/direct-debit-mandate/:mandateId/confirm", (c) =>
    directDebitMandateController.confirmMandate(c)
  );
  routes.post("/:groupId/direct-debit-mandate/:mandateId/done", (c) =>
    directDebitMandateController.confirmMandateDone(c)
  );
  routes.post("/:id/invites/:inviteId/poke", (c) => groupController.pokeInvite(c));
  routes.post("/:id/invite", (c) => groupController.inviteMembers(c));
  routes.post("/:id/stats", (c) => groupController.getStats(c));
  routes.get("/:id", (c) => groupController.getGroup(c));
  routes.post("/:id/exit", (c) => groupController.requestExit(c));
  routes.post("/:id/exit/final", (c) => groupController.finalExit(c));
  return routes;
}
