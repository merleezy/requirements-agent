import { Router, type Request, type Response } from "express";
import { toSessionState, type SessionStore } from "../session/store.ts";
import { requireSession } from "./require.ts";

export { SESSION_HEADER } from "./require.ts";

export function sessionRouter(store: SessionStore): Router {
  const router = Router();

  /* Start a new session. The client stores the returned sessionId in
   * sessionStorage and sends it back in the x-session-id header. */
  router.post("/", (_req: Request, res: Response) => {
    const session = store.create();
    res.status(201).json(toSessionState(session));
  });

  /* Fetch current session state. requireSession yields 404 (not 401) on
   * unknown/expired ids - there is no auth here, the id just no longer
   * exists; the client responds by creating a fresh session. */
  router.get("/", (req: Request, res: Response) => {
    const session = requireSession(store, req);
    res.json(toSessionState(session));
  });

  return router;
}
