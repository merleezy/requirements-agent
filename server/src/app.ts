import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { SessionStore } from "./session/store.ts";
import { sessionRouter } from "./routes/session.ts";

export function createApp(store: SessionStore = new SessionStore()) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use("/api/session", sessionRouter(store));

  /* Unknown /api paths get the same JSON error shape as everything else. */
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown API route." },
    });
  });

  /* Last-resort error handler. Logs the error itself but never the request
   * (headers carry the user's API key once callLLM lands - keys must never
   * reach a log, per the spec's key-handling rules). */
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error(err.stack ?? err.message);
    res.status(500).json({
      error: { code: "INTERNAL", message: "Internal server error." },
    });
  });

  return app;
}
