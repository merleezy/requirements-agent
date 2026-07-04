import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import { applyReviewGates, type PreviousFinding } from "../agents/finalReview.ts";
import { callLLM } from "../llm/callLLM.ts";
import type { SessionStore } from "../session/store.ts";
import { recordAcceptedRisk } from "./decisions.ts";
import { requireApiKey, requireClarificationPairs, requireSession } from "./require.ts";

/* Findings from the client's previous review round, echoed back so the
 * reviewer can converge (see the prompt's Re-review Rules). Unknown enum
 * values are coerced rather than rejected - a slightly-off disposition must
 * not fail the whole review call. */
const MAX_PREVIOUS_FINDINGS = 32;

function requirePreviousFindings(value: unknown): PreviousFinding[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > MAX_PREVIOUS_FINDINGS) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      `previousFindings must be an array of at most ${MAX_PREVIOUS_FINDINGS} findings.`,
    );
  }
  const findings: PreviousFinding[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) {
      throw new HttpError(400, "INVALID_INPUT", "previousFindings entries must be objects.");
    }
    const f = item as Record<string, unknown>;
    const explanation = typeof f.explanation === "string" ? f.explanation.trim() : "";
    if (explanation.length === 0) {
      throw new HttpError(
        400,
        "INVALID_INPUT",
        "previousFindings entries must have a non-empty explanation.",
      );
    }
    const severity =
      f.severity === "high" || f.severity === "medium" || f.severity === "low"
        ? f.severity
        : "medium";
    findings.push({
      severity,
      category: typeof f.category === "string" ? f.category.trim() : "General",
      location: typeof f.location === "string" ? f.location.trim() : "PRD Document",
      explanation,
      disposition: f.disposition === "fix_applied" ? "fix_applied" : "not_addressed",
    });
  }
  return findings;
}

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

    const body = req.body as { clarifications?: unknown; previousFindings?: unknown } | null;
    const clarificationQa =
      body?.clarifications === undefined
        ? []
        : requireClarificationPairs(body.clarifications);
    const previousFindings = requirePreviousFindings(body?.previousFindings);

    /* Persist any findings the user left as-is as durable accepted risks, so
     * they survive a reload and later rounds even if the client stops sending
     * them back as previousFindings. recordAcceptedRisk dedups by
     * (anchor, statement), so this is idempotent across rounds. */
    for (const f of previousFindings) {
      if (f.disposition === "not_addressed") {
        recordAcceptedRisk(session.decisions, {
          anchor: f.location,
          statement: f.explanation,
          category: f.category,
        });
      }
    }

    const output = await callLLM(
      "final_review",
      { project, clarificationQa, prd, previousFindings, decisions: session.decisions },
      { session, apiKey },
    );

    /* Context-dependent gates the callLLM-path parser can't apply: validate
     * anchors against the real requirement ids and suppress anything matching
     * an accepted decision. */
    const validAnchors = new Set(
      prd.functionalRequirements.map((r) => r.id.toLowerCase()),
    );
    const gated = applyReviewGates(output, {
      validAnchors,
      acceptedDecisions: session.decisions,
    });

    res.json(gated);
  });

  return router;
}
