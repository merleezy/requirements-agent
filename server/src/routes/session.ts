import { Router, type Request, type Response } from "express";
import { toSessionState, type SessionStore } from "../session/store.ts";

export const SESSION_HEADER = "x-session-id";

export function sessionRouter(store: SessionStore): Router {
  const router = Router();

  /* Start a new session. The client stores the returned sessionId in
   * sessionStorage and sends it back in the x-session-id header. */
  router.post("/", (_req: Request, res: Response) => {
    const session = store.create();
    res.status(201).json(toSessionState(session));
  });

  /* Fetch current session state. 404 (not 401) on unknown/expired ids -
   * there is no auth here, the id just no longer exists; the client
   * responds by creating a fresh session. */
  router.get("/", (req: Request, res: Response) => {
    const id = req.header(SESSION_HEADER);
    if (!id) {
      res.status(400).json({
        error: {
          code: "SESSION_ID_MISSING",
          message: `Missing ${SESSION_HEADER} header.`,
        },
      });
      return;
    }
    const session = store.get(id);
    if (!session) {
      res.status(404).json({
        error: {
          code: "SESSION_NOT_FOUND",
          message: "Session does not exist or has expired.",
        },
      });
      return;
    }
    res.json(toSessionState(session));
  });

  return router;
}
