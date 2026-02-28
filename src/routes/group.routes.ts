import { Hono } from "hono";
import { requireAuth } from "../middlewares/auth.middleware";
import type { GroupController } from "../controllers/group.controller";

export function createGroupRoutes(groupController: GroupController): Hono {
  const routes = new Hono();
  routes.use("*", requireAuth);
  routes.post("/", (c) => groupController.createGroup(c));
  routes.post("/:id/invite", (c) => groupController.inviteMembers(c));
  routes.get("/:id", (c) => groupController.getGroup(c));
  routes.post("/:id/exit", (c) => groupController.requestExit(c));
  routes.post("/:id/exit/final", (c) => groupController.finalExit(c));
  return routes;
}
