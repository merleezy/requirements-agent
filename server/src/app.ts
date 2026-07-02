import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { HttpError } from "./errors.ts";
import { SessionStore } from "./session/store.ts";
import { clarifyRouter } from "./routes/clarify.ts";
import { criticRouter } from "./routes/critic.ts";
import { draftRouter } from "./routes/draft.ts";
import { modelsRouter } from "./routes/models.ts";
import { reviseGlobalRouter } from "./routes/reviseGlobal.ts";
import { reviseLocalRouter } from "./routes/reviseLocal.ts";
import { sessionRouter } from "./routes/session.ts";

export function createApp(store: SessionStore = new SessionStore()) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ ok: true });
  });

  app.use("/api/session", sessionRouter(store));
  app.use("/api/models", modelsRouter());
  app.use("/api/clarify", clarifyRouter(store));
  app.use("/api/draft", draftRouter(store));
  app.use("/api/critic", criticRouter(store));
  app.use("/api/revise-local", reviseLocalRouter(store));
  app.use("/api/revise-global", reviseGlobalRouter(store));

  /* Unknown /api paths get the same JSON error shape as everything else. */
  app.use("/api", (_req: Request, res: Response) => {
    res.status(404).json({
      error: { code: "NOT_FOUND", message: "Unknown API route." },
    });
  });

  /* Error handler. HttpError carries the API's uniform error shape (thrown
   * by route preconditions and callLLM; Express 5 forwards async rejections
   * here). Logs the error itself but never the request - headers carry the
   * user's API key, and keys must never reach a log, per the spec's
   * key-handling rules. */
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message },
      });
      return;
    }
    console.error(err.stack ?? err.message);
    res.status(500).json({
      error: { code: "INTERNAL", message: "Internal server error." },
    });
  });

  return app;
}
