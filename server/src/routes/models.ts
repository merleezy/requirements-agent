import { Router, type Request, type Response } from "express";
import { modelPresets } from "../llm/modelConfig.ts";
import { fetchModelList } from "../llm/models.ts";

/*
 * GET /api/models - the settings page's catalog: the (cached) OpenRouter
 * model list plus the three presets. No session and no API key required:
 * the upstream endpoint is public and nothing here is per-user.
 */
export function modelsRouter(): Router {
  const router = Router();

  router.get("/", async (_req: Request, res: Response) => {
    const models = await fetchModelList();
    res.json({ models, presets: modelPresets });
  });

  return router;
}
