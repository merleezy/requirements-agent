import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import { callLLM } from "../llm/callLLM.ts";
import type { SessionStore } from "../session/store.ts";
import { requireApiKey, requireClarificationPairs, requireSession } from "./require.ts";

export function finalReviewRouter(store: SessionStore): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const session = requireSession(store, req);
    const apiKey = requireApiKey(req);

    const prd = session.prd;
    const project = session.project;
    if (!prd || !project) {
      throw new HttpError(
        400,
        "NO_PRD",
        "There is no drafted PRD to review - run the draft stage first.",
      );
    }

    const body = req.body as { clarifications?: unknown } | null;
    const clarificationQa =
      body?.clarifications === undefined
        ? []
        : requireClarificationPairs(body.clarifications);

    const output = await callLLM(
      "final_review",
      { project, clarificationQa, prd },
      { session, apiKey },
    );

    res.json(output);
  });

  return router;
}
