import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import { callLLM } from "../llm/callLLM.ts";
import { toSessionState, type SessionStore } from "../session/store.ts";
import type { Requirement } from "../types.ts";
import { splitRequirementLines } from "../util/text.ts";
import { requireApiKey, requireSession } from "./require.ts";

/*
 * POST /api/revise-local - the local per-requirement revise loop (spec
 * pipeline stage 4), pulled forward from the original step-9 plan to close
 * a gap in step 7: accepting a rewrite or declining a flag had no way to
 * actually fix anything, and judgment confirmations lived only in client
 * state (see CLAUDE.md "Current stage" for the decision and the bug that
 * prompted fixing this). Resolves exactly one flagged requirement, three
 * ways:
 *
 *   { requirementId, acceptSuggestedRewrite: true }  (defect flags)
 *     applies the critic's own suggestedRewrite verbatim - no LLM call
 *     needed, the text is already fully determined.
 *   { requirementId, response: string }  (defect flags)
 *     freeform feedback (e.g. "that's not what I meant - X and Y are
 *     different concepts") goes through the revise-local agent, which
 *     either resolves the flag or honestly says it couldn't
 *     (`unresolved`) rather than guessing.
 *   { requirementId, confirmJudgment: true }  (judgment flags)
 *   { requirementId, moveToOutOfScope: true }  (judgment flags)
 *     the user resolves a scoped/traceable flag by confirming intent or
 *     moving the requirement out of scope - per the rubric, judgment
 *     dimensions never get a rewrite, so both are a direct state change
 *     with no LLM call and no recheck (the text didn't change, so
 *     re-running the critic on it would just flag the same judgment call
 *     again). Persisting this server-side, rather than leaving it as
 *     client-only state, is what makes it actually stick - previously the
 *     session's own copy still showed the old flag, so the very next
 *     revise-local response (which returns the full requirements array)
 *     silently reverted the user's confirmation back to flagged.
 *
 * Either path can produce an atomic split (one-requirement-per-line,
 * spec-defined encoding); a split replaces the original requirement with
 * new ids `${originalId}.1`, `${originalId}.2`, ... Per the spec, "any
 * requirement [a revision loop] touches gets auto re-run through the
 * critic" - so whatever comes out of this route (one requirement, or a
 * split's several) is critic-checked before the response goes back, the
 * same failure-tolerant way the critic route itself works.
 */

export function reviseLocalRouter(store: SessionStore): Router {
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
        "There is no drafted PRD to revise - run the draft stage first.",
      );
    }

    const body = req.body as
      | {
          requirementId?: unknown;
          acceptSuggestedRewrite?: unknown;
          response?: unknown;
          confirmJudgment?: unknown;
          moveToOutOfScope?: unknown;
        }
      | null;
    const requirementId = body?.requirementId;
    if (typeof requirementId !== "string" || requirementId.length === 0) {
      throw new HttpError(400, "INVALID_INPUT", "requirementId must be a non-empty string.");
    }
    const idx = prd.functionalRequirements.findIndex((r) => r.id === requirementId);
    if (idx === -1) {
      throw new HttpError(400, "INVALID_INPUT", `Unknown requirement id: ${requirementId}`);
    }
    const requirement = prd.functionalRequirements[idx];
    const flag = requirement.flag;
    if (!flag) {
      throw new HttpError(
        400,
        "NO_FLAG",
        `Requirement ${requirementId} has no open critic flag to revise.`,
      );
    }

    if (body?.confirmJudgment === true || body?.moveToOutOfScope === true) {
      if (flag.nature !== "judgment") {
        throw new HttpError(
          400,
          "INVALID_INPUT",
          `Requirement ${requirementId}'s flag is not a judgment call - use acceptSuggestedRewrite or response instead.`,
        );
      }
      if (body.moveToOutOfScope === true) {
        prd.functionalRequirements.splice(idx, 1);
        prd.outOfScope.push(requirement.text);
      } else {
        requirement.status = "accepted";
        requirement.flag = null;
        requirement.acceptedAsIs = true;
      }
      res.json({
        state: toSessionState(session),
        requirementId,
        newRequirementIds: body.moveToOutOfScope === true ? [] : [requirementId],
        resolved: true,
        message: null,
        failures: [],
      });
      return;
    }
    if (flag.nature === "judgment") {
      throw new HttpError(
        400,
        "JUDGMENT_FLAG",
        "Judgment-dimension flags never get a rewrite - resolve with confirmJudgment instead.",
      );
    }

    let rewriteText: string;
    if (body?.acceptSuggestedRewrite === true) {
      if (!flag.suggestedRewrite) {
        throw new HttpError(
          400,
          "INVALID_INPUT",
          `Requirement ${requirementId} has no suggested rewrite to accept.`,
        );
      }
      rewriteText = flag.suggestedRewrite;
    } else if (typeof body?.response === "string" && body.response.trim().length > 0) {
      const output = await callLLM(
        "revise_local",
        { requirement: { id: requirement.id, text: requirement.text }, flag, response: body.response.trim() },
        { session, apiKey },
      );
      if (output.unresolved !== null) {
        res.json({
          state: toSessionState(session),
          requirementId,
          newRequirementIds: [requirementId],
          resolved: false,
          message: output.unresolved,
          failures: [],
        });
        return;
      }
      rewriteText = output.revisedText as string;
    } else {
      throw new HttpError(
        400,
        "INVALID_INPUT",
        "Provide either acceptSuggestedRewrite: true or a non-empty response.",
      );
    }

    const lines = splitRequirementLines(rewriteText);
    const revised: Requirement[] =
      lines.length <= 1
        ? [{ ...requirement, text: lines[0] ?? rewriteText, status: "draft", flag: null, acceptedAsIs: false }]
        : lines.map((text, i) => ({
            id: `${requirement.id}.${i + 1}`,
            text,
            section: "functionalRequirements",
            status: "draft",
            flag: null,
            acceptedAsIs: false,
          }));
    prd.functionalRequirements.splice(idx, 1, ...revised);

    res.json({
      state: toSessionState(session),
      requirementId,
      newRequirementIds: revised.map((r) => r.id),
      resolved: false,
      message: null,
      failures: [],
    });
  });

  return router;
}
