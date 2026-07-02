import { Router, type Request, type Response } from "express";
import { callLLM } from "../llm/callLLM.ts";
import { toSessionState, type SessionStore } from "../session/store.ts";
import type { PRD, Project } from "../types.ts";
import type { DraftOutput } from "../agents/draft.ts";
import {
  requireApiKey,
  requireClarificationPairs,
  requireIdeaText,
  requireSession,
} from "./require.ts";

/*
 * POST /api/draft - build-order step 5: idea -> PRD through callLLM.
 * Creates the session's Project from the idea text, runs the draft agent,
 * and stores the normalized PRD on the session. Since step 6 the body also
 * carries the clarify stage's Q&A pairs ({ question, answer } by question
 * text, blank answer = skipped); it stays optional so drafting works even
 * when clarify asked nothing.
 */

export function draftRouter(store: SessionStore): Router {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    const session = requireSession(store, req);
    const apiKey = requireApiKey(req);
    const body = req.body as
      | { ideaText?: unknown; clarifications?: unknown }
      | null;

    const idea = requireIdeaText(body);
    const clarifications =
      body?.clarifications === undefined
        ? []
        : requireClarificationPairs(body.clarifications);
    const output = await callLLM(
      "draft",
      { ideaText: idea, clarifications },
      { session, apiKey },
    );

    /* Commit to the session only after the call succeeded, so a failed
     * draft leaves any previous state untouched. The document title comes
     * from the draft agent itself (prompt revision 2026-07-01). */
    const project: Project = {
      title: output.title,
      ideaText: idea,
      createdAt: new Date().toISOString(),
      stage: "reviewing",
    };
    session.project = project;
    session.prd = toPrd(output);
    res.json(toSessionState(session));
  });

  return router;
}

/* Normalizes the draft agent's output into the session PRD. Model-provided
 * requirement ids were already dropped at parse time; the server assigns
 * stable ids so later stages (critic flags, annotations) have a reliable
 * target. All requirements start as "draft" - flags arrive with the critic
 * at step 7. */
function toPrd(output: DraftOutput): PRD {
  return {
    summary: output.summary,
    problemStatement: output.problemStatement,
    targetUsers: output.targetUsers,
    goals: output.goals,
    functionalRequirements: output.functionalRequirements.map((r, i) => ({
      id: `FR-${i + 1}`,
      text: r.text,
      section: "functionalRequirements",
      status: "draft",
      flag: null,
    })),
    outOfScope: output.outOfScope,
    openQuestions: output.openQuestions,
  };
}
