import { Router, type Request, type Response } from "express";
import { HttpError } from "../errors.ts";
import type { SessionStore } from "../session/store.ts";
import type { Decision } from "../types.ts";
import { requireSession } from "./require.ts";

/*
 * POST /api/decisions - record a durable "accepted risk": a final-review
 * finding the user dismissed. Stored on the session (append-only) so the
 * final reviewer is told not to re-raise it, and so it survives a page reload
 * (round-tripped by GET /api/session) instead of living only in client state.
 *
 * No LLM call and no API key: this is pure session bookkeeping.
 */

const MAX_STATEMENT = 4_000;
const MAX_ANCHOR = 500;
const MAX_CATEGORY = 200;
/* Bound the append-only list so a very long session can't grow it without
 * limit; the oldest decisions fall off first. Far above any real review's
 * finding count. */
const MAX_DECISIONS = 200;

function nextDecisionId(decisions: Decision[]): string {
  const max = decisions.reduce((m, d) => {
    const n = Number.parseInt(d.id.replace(/^D-/, ""), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `D-${max + 1}`;
}

/* Appends an accepted-risk decision, deduped by (anchor, statement) so the
 * same dismissal recorded twice - once by this endpoint, once by the
 * final-review route's not_addressed merge - yields a single decision.
 * Returns the created or the existing matching decision. Exported for reuse
 * by the final-review route. */
export function recordAcceptedRisk(
  decisions: Decision[],
  fields: { anchor: string; statement: string; category: string },
): Decision {
  const anchor = fields.anchor.trim();
  const statement = fields.statement.trim();
  const category = fields.category.trim() || "General";

  const existing = decisions.find(
    (d) =>
      d.anchor.trim().toLowerCase() === anchor.toLowerCase() &&
      d.statement.trim().toLowerCase() === statement.toLowerCase(),
  );
  if (existing) return existing;

  const decision: Decision = {
    id: nextDecisionId(decisions),
    kind: "accepted_risk",
    anchor,
    statement,
    category,
    decidedAt: new Date().toISOString(),
  };
  decisions.push(decision);
  while (decisions.length > MAX_DECISIONS) decisions.shift();
  return decision;
}

export function decisionsRouter(store: SessionStore): Router {
  const router = Router();

  router.post("/", (req: Request, res: Response) => {
    const session = requireSession(store, req);

    const body = req.body as
      | { anchor?: unknown; statement?: unknown; category?: unknown }
      | null;

    const statement = typeof body?.statement === "string" ? body.statement.trim() : "";
    if (statement.length === 0) {
      throw new HttpError(400, "INVALID_INPUT", "statement must be a non-empty string.");
    }
    if (
      statement.length > MAX_STATEMENT ||
      (typeof body?.anchor === "string" && body.anchor.length > MAX_ANCHOR) ||
      (typeof body?.category === "string" && body.category.length > MAX_CATEGORY)
    ) {
      throw new HttpError(400, "INVALID_INPUT", "decision fields exceed the allowed length.");
    }

    const decision = recordAcceptedRisk(session.decisions, {
      anchor: typeof body?.anchor === "string" ? body.anchor : "",
      statement,
      category: typeof body?.category === "string" ? body.category : "General",
    });

    res.status(201).json({ decision });
  });

  return router;
}
