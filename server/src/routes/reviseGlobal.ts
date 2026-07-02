import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import { callLLM } from "../llm/callLLM.ts";
import { toSessionState, type SessionStore } from "../session/store.ts";
import type { Annotation, PRD, Requirement } from "../types.ts";
import type { ReviseGlobalOutput } from "../agents/reviseGlobal.ts";
import { splitRequirementLines } from "../util/text.ts";
import { requireApiKey, requireSession } from "./require.ts";

/*
 * POST /api/revise-global - build-order step 9: whole-document feedback (spec
 * pipeline stage 5). The user gives free-form feedback about the PRD as a
 * whole - a missing requirement, a re-scoping note, a comment left on one part
 * of the document - and the revise-global agent returns a diff, which this
 * route applies to the session PRD.
 *
 * Body:
 *   { feedback: string, targetId?: string }
 * `feedback` is the user's text (required, non-empty). `targetId`, when
 * present, is the id of the requirement or section item the feedback was left
 * as a comment on; it is resolved here (including re-deriving the client's
 * deterministic section-item ids) so the agent can anchor the feedback and so
 * an Annotation is recorded against it.
 *
 * The diff is applied only after the LLM call succeeds (the established
 * commit-on-success pattern). Unknown ids the model returns are skipped
 * silently rather than failing the whole pass - a hallucinated id must not
 * 500 an otherwise-good revision. New requirements get server-assigned ids
 * (models never mint ids); each non-null section field is a full replacement.
 *
 * The revise-global prompt has no prose reply field (prompts are verbatim), so
 * this route builds Draftsmith's reply itself: a deterministic summary of what
 * changed, styled like the app's other Draftsmith messages. That summary is
 * both the response's `summary` and, when a target was given, the annotation's
 * agentResponse.
 *
 * The critic re-check is deliberately NOT run here - the client triggers it in
 * the background (same decision as revise-local), keeping this route fast.
 */

export function reviseGlobalRouter(store: SessionStore): Router {
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

    const body = req.body as { feedback?: unknown; targetId?: unknown } | null;
    const feedback = requireFeedback(body?.feedback);
    const target = resolveTarget(prd, body?.targetId);

    const output = await callLLM(
      "revise_global",
      {
        ideaText: project.ideaText,
        title: project.title,
        prd: {
          problemStatement: prd.problemStatement,
          targetUsers: prd.targetUsers,
          goals: prd.goals,
          functionalRequirements: prd.functionalRequirements.map((r) => ({
            id: r.id,
            text: r.text,
          })),
          outOfScope: prd.outOfScope,
          openQuestions: prd.openQuestions,
        },
        feedback,
        target: target && {
          id: target.id,
          description: target.description,
          text: target.text,
        },
      },
      { session, apiKey },
    );

    const result = applyReviseGlobal(prd, output);
    if (result.applied) prd.version += 1;

    const summary = buildSummary(result);

    let annotationId: string | null = null;
    if (target) {
      const annotation: Annotation = {
        id: `A-${session.annotations.length + 1}`,
        targetId: target.id,
        userComment: feedback,
        agentResponse: summary,
        resolved: result.applied,
      };
      session.annotations.push(annotation);
      annotationId = annotation.id;
    }

    res.json({
      state: toSessionState(session),
      summary,
      applied: result.applied,
      changedRequirementIds: result.changedRequirementIds,
      newRequirementIds: result.newRequirementIds,
      removedRequirementIds: result.removedRequirementIds,
      changedSections: result.changedSections,
      annotationId,
    });
  });

  return router;
}

const MAX_FEEDBACK_LENGTH = 8_000;

function requireFeedback(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new HttpError(400, "INVALID_INPUT", "feedback must be a non-empty string.");
  }
  if (value.length > MAX_FEEDBACK_LENGTH) {
    throw new HttpError(
      400,
      "INVALID_INPUT",
      `feedback must be at most ${MAX_FEEDBACK_LENGTH} characters.`,
    );
  }
  return value.trim();
}

interface ResolvedTarget {
  id: string;
  description: string;
  text: string;
}

/*
 * Resolves an optional targetId to the requirement or section item it names.
 * Requirement ids (`FR-...`) match prd.functionalRequirements by id. Section
 * items use the client's deterministic position scheme, re-derived here so the
 * server and client agree on what a comment is anchored to:
 *   ps        -> the problem statement
 *   tu-{n}    -> targetUsers[n-1]     (1-based)
 *   g-{n}     -> goals[n-1]
 *   oos-{n}   -> outOfScope[n-1]
 *   oq-{n}    -> openQuestions[n-1]
 * An out-of-range index or an unrecognized id is a 400 (the client should only
 * ever send ids it derived from the current PRD).
 */
function resolveTarget(prd: PRD, value: unknown): ResolvedTarget | null {
  if (value === undefined) return null;
  if (typeof value !== "string" || value.length === 0) {
    throw new HttpError(400, "INVALID_INPUT", "targetId must be a non-empty string.");
  }

  if (value.startsWith("FR-")) {
    const requirement = prd.functionalRequirements.find((r) => r.id === value);
    if (!requirement) {
      throw new HttpError(400, "INVALID_INPUT", `Unknown target id: ${value}`);
    }
    return { id: value, description: `requirement ${value}`, text: requirement.text };
  }

  if (value === "ps") {
    return { id: value, description: "the problem statement", text: prd.problemStatement };
  }

  const sectionItem =
    matchSectionItem(value, "tu", prd.targetUsers, "target user") ??
    matchSectionItem(value, "g", prd.goals, "goal") ??
    matchSectionItem(value, "oos", prd.outOfScope, "out-of-scope item") ??
    matchSectionItem(value, "oq", prd.openQuestions, "open question");
  if (sectionItem) return sectionItem;

  throw new HttpError(400, "INVALID_INPUT", `Unknown target id: ${value}`);
}

function matchSectionItem(
  id: string,
  prefix: string,
  items: string[],
  label: string,
): ResolvedTarget | null {
  const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  if (n < 1 || n > items.length) {
    throw new HttpError(400, "INVALID_INPUT", `Unknown target id: ${id}`);
  }
  return { id, description: `${label} ${n}`, text: items[n - 1] };
}

interface ApplyResult {
  applied: boolean;
  changedRequirementIds: string[];
  newRequirementIds: string[];
  removedRequirementIds: string[];
  changedSections: string[];
}

/* Human names for the replaceable sections, for the summary sentence. */
const SECTION_LABELS: Record<string, string> = {
  problemStatement: "Problem statement",
  targetUsers: "Target users",
  goals: "Goals",
  outOfScope: "Out of scope",
  openQuestions: "Open questions",
};

/*
 * Applies the agent's diff to the PRD in place. Unknown changed/removed ids
 * are silently skipped; only ids actually acted on are reported back.
 */
function applyReviseGlobal(prd: PRD, output: ReviseGlobalOutput): ApplyResult {
  const changedRequirementIds: string[] = [];
  const removedRequirementIds: string[] = [];
  const changedSections: string[] = [];

  /* 1. Changed requirements: one line = in-place edit; multiple lines = an
   * atomic split replacing the requirement at its position with `${id}.1`,
   * `${id}.2`, ... exactly like routes/reviseLocal.ts. Reset to draft so the
   * critic re-check re-evaluates the new text. */
  for (const change of output.changedRequirements) {
    const idx = prd.functionalRequirements.findIndex((r) => r.id === change.id);
    if (idx === -1) continue; /* hallucinated id - skip, don't fail the pass */
    const original = prd.functionalRequirements[idx];
    const lines = splitRequirementLines(change.revisedText);
    if (lines.length <= 1) {
      const text = lines[0] ?? change.revisedText;
      prd.functionalRequirements[idx] = {
        ...original,
        text,
        status: "draft",
        flag: null,
        acceptedAsIs: false,
      };
      changedRequirementIds.push(original.id);
    } else {
      const split: Requirement[] = lines.map((text, i) => ({
        id: `${original.id}.${i + 1}`,
        text,
        section: "functionalRequirements",
        status: "draft",
        flag: null,
        acceptedAsIs: false,
      }));
      prd.functionalRequirements.splice(idx, 1, ...split);
      for (const r of split) changedRequirementIds.push(r.id);
    }
  }

  /* 2. Removals: drop matching requirements; unknown ids ignored. */
  for (const id of output.removedRequirementIds) {
    const idx = prd.functionalRequirements.findIndex((r) => r.id === id);
    if (idx === -1) continue;
    prd.functionalRequirements.splice(idx, 1);
    removedRequirementIds.push(id);
  }

  /* 3. New requirements: server-assigned ids (models never mint ids) from
   * the PRD's monotonic counter, so an id removed above (or in any earlier
   * pass) is never reissued to a different requirement. */
  const newRequirementIds: string[] = [];
  for (const added of output.newRequirements) {
    const id = `FR-${prd.nextRequirementNumber}`;
    prd.nextRequirementNumber += 1;
    prd.functionalRequirements.push({
      id,
      text: added.text,
      section: "functionalRequirements",
      status: "draft",
      flag: null,
    });
    newRequirementIds.push(id);
  }

  /* 4. Section changes: each non-null field fully replaces the PRD field. */
  const sections = output.otherSectionChanges;
  if (sections.problemStatement !== null) {
    prd.problemStatement = sections.problemStatement;
    changedSections.push("problemStatement");
  }
  if (sections.targetUsers !== null) {
    prd.targetUsers = sections.targetUsers;
    changedSections.push("targetUsers");
  }
  if (sections.goals !== null) {
    prd.goals = sections.goals;
    changedSections.push("goals");
  }
  if (sections.outOfScope !== null) {
    prd.outOfScope = sections.outOfScope;
    changedSections.push("outOfScope");
  }
  if (sections.openQuestions !== null) {
    prd.openQuestions = sections.openQuestions;
    changedSections.push("openQuestions");
  }

  const applied =
    changedRequirementIds.length > 0 ||
    newRequirementIds.length > 0 ||
    removedRequirementIds.length > 0 ||
    changedSections.length > 0;

  return {
    applied,
    changedRequirementIds,
    newRequirementIds,
    removedRequirementIds,
    changedSections,
  };
}

/*
 * Draftsmith's deterministic reply, since the revise-global prompt returns no
 * prose. Styled like the app's other Draftsmith messages (see the greeting in
 * client/src/App.tsx). Requirements are named by id - the client maps ids to
 * display refs; ids are what the server has.
 */
function buildSummary(result: ApplyResult): string {
  if (!result.applied) {
    return "I looked at that feedback but didn't find anything to change in the PRD - let me know if you'd like me to take it further.";
  }

  const parts: string[] = [];
  if (result.changedRequirementIds.length > 0) {
    parts.push(
      `updated ${countLabel(result.changedRequirementIds.length, "requirement")} (${joinIds(result.changedRequirementIds)})`,
    );
  }
  if (result.newRequirementIds.length > 0) {
    parts.push(
      `added ${countLabel(result.newRequirementIds.length, "requirement")} (${joinIds(result.newRequirementIds)})`,
    );
  }
  if (result.removedRequirementIds.length > 0) {
    parts.push(
      `removed ${countLabel(result.removedRequirementIds.length, "requirement")} (${joinIds(result.removedRequirementIds)})`,
    );
  }
  if (result.changedSections.length > 0) {
    const names = result.changedSections.map((s) => SECTION_LABELS[s] ?? s);
    parts.push(`rewrote ${joinList(names)}`);
  }

  /* The critic only checks requirements, so only promise a re-check when
   * some were actually touched (the client triggers it from these ids). */
  const recheck =
    result.changedRequirementIds.length > 0 || result.newRequirementIds.length > 0
      ? " The critic will re-check anything I touched."
      : "";
  return `Done - I ${joinList(parts)}.${recheck}`;
}

function countLabel(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? "" : "s"}`;
}

function joinIds(ids: string[]): string {
  return ids.join(", ");
}

/* "a", "a and b", "a, b, and c" - a plain Oxford-comma list. */
function joinList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
