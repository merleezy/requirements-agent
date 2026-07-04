import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import { HttpError } from "./errors.ts";
import { SessionStore } from "./session/store.ts";
import { clarifyRouter } from "./routes/clarify.ts";
import { criticRouter } from "./routes/critic.ts";
import { decisionsRouter } from "./routes/decisions.ts";
import { draftRouter } from "./routes/draft.ts";
import { finalReviewRouter } from "./routes/finalReview.ts";
import { modelsRouter } from "./routes/models.ts";
import { reviseGlobalRouter } from "./routes/reviseGlobal.ts";
import { reviseLocalRouter } from "./routes/reviseLocal.ts";
import { sessionRouter } from "./routes/session.ts";

export function createApp(store: SessionStore = new SessionStore()) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  /* CORS Middleware for cross-origin deployments (e.g. Vercel frontend -> Railway backend). */
  app.use((req: Request, res: Response, next: NextFunction) => {
    const rawOrigin = process.env.CORS_ORIGIN ?? req.headers.origin ?? "*";
    const allowedOrigin =
      rawOrigin === "*" ? "*" : rawOrigin.trim().replace(/\/+$/, "");
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, x-session-id, x-openrouter-key"
    );
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }

    next();
  });

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
  app.use("/api/final-review", finalReviewRouter(store));
  app.use("/api/decisions", decisionsRouter(store));

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
