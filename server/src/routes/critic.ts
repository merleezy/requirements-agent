import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import { callLLM } from "../llm/callLLM.ts";
import { toSessionState, type SessionStore } from "../session/store.ts";
import type { CriticFlag, Requirement } from "../types.ts";
import type { CriticOutput } from "../agents/critic.ts";
import { mapWithConcurrency } from "../util/concurrency.ts";
import { requireApiKey, requireSession } from "./require.ts";

/*
 * POST /api/critic - build-order step 7: run the critic over the session's
 * PRD, one callLLM per requirement (the one-flag-per-pass rule means a
 * requirement is exactly one call). Body: { requirementIds?: string[] } to
 * check a subset (the revise loop at step 9 re-checks single requirements
 * this way); omitted = every requirement.
 *
 * Requirements are independent, so the pass is not all-or-nothing: each
 * successful check commits to the session immediately (passed -> accepted,
 * failed -> flagged) and per-requirement failures are reported in the
 * response's `failures` array instead of discarding the successes. A
 * requirement whose check failed keeps its previous status/flag.
 */

/* Modest fan-out: fast enough for a typical PRD without slamming the
 * user's OpenRouter key into a rate limit. */
const CONCURRENCY = 4;

/* Exported for reuse by routes/reviseLocal.ts, which re-runs the critic on
 * whatever it revises and reports failures the same way. */
export interface CriticFailure {
  requirementId: string;
  code: string;
  message: string;
}

export function criticRouter(store: SessionStore): Router {
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
        "There is no drafted PRD to check - run the draft stage first.",
      );
    }

    const targets = resolveTargets(prd.functionalRequirements, req.body);

    const results = await mapWithConcurrency(targets, CONCURRENCY, (r) => {
      if (r.acceptedAsIs) {
        return Promise.resolve({
          passed: true,
          dimension: null,
          nature: null,
          reason: null,
          suggestedRewrite: null,
          assumption: null,
        });
      }
      return callLLM(
        "critic",
        {
          requirement: { id: r.id, text: r.text },
          ideaText: project.ideaText,
          problemStatement: prd.problemStatement,
          goals: prd.goals,
        },
        { session, apiKey },
      );
    });

    const failures: CriticFailure[] = [];
    results.forEach((result, i) => {
      const requirement = targets[i];
      if (result.ok) {
        applyCriticOutput(requirement, result.value);
      } else {
        failures.push(toFailure(requirement.id, result.error));
      }
    });

    res.json({ state: toSessionState(session), failures });
  });

  return router;
}

function resolveTargets(requirements: Requirement[], body: unknown): Requirement[] {
  const ids = (body as { requirementIds?: unknown } | null)?.requirementIds;
  if (ids === undefined) return requirements;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string")) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      "requirementIds must be an array of requirement id strings.",
    );
  }
  const byId = new Map(requirements.map((r) => [r.id, r]));
  return (ids as string[]).map((id) => {
    const requirement = byId.get(id);
    if (!requirement) {
      throw new HttpError(400, "INVALID_INPUT", `Unknown requirement id: ${id}`);
    }
    return requirement;
  });
}

/* passed -> resolved ("accepted" - the spec's export-gate condition is a
 * pass from the critic after the most recent change); failed -> flagged
 * with the single normalized flag. Exported for unit tests. */
export function applyCriticOutput(requirement: Requirement, output: CriticOutput): void {
  if (output.passed) {
    requirement.status = "accepted";
    requirement.flag = null;
    return;
  }
  /* parseCriticOutput guarantees dimension/nature/reason on a failed check */
  requirement.status = "flagged";
  requirement.flag = {
    dimension: output.dimension,
    nature: output.nature,
    reason: output.reason,
    suggestedRewrite: output.suggestedRewrite,
    assumption: output.assumption,
  } as CriticFlag;
}

export function toFailure(requirementId: string, error: unknown): CriticFailure {
  if (error instanceof HttpError) {
    return { requirementId, code: error.code, message: error.message };
  }
  return {
    requirementId,
    code: "INTERNAL",
    message: error instanceof Error ? error.message : String(error),
  };
}
