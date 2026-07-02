import type { Requirement } from "../types";
import { api } from "./api";
import { bootstrapSession } from "./session";

/*
 * Step 7: the critic pass. One POST runs the critic server-side over every
 * requirement (or a given subset); the server commits each successful check
 * to the session and reports per-requirement failures instead of failing
 * the whole pass. The client applies the returned statuses/flags to the
 * document and reports anything unchecked.
 */

export interface CriticFailure {
  requirementId: string;
  code: string;
  message: string;
}

/* What a critique changes on a requirement - text never changes here. */
export interface RequirementCheck {
  id: string;
  status: Requirement["status"];
  flag: Requirement["flag"];
}

interface CriticResponse {
  state: {
    prd: {
      functionalRequirements: { id: string; status: Requirement["status"]; flag: Requirement["flag"] }[];
    };
  };
  failures: CriticFailure[];
}

export async function runCritic(
  requirementIds: string[] | undefined,
  apiKey: string,
): Promise<{ requirements: RequirementCheck[]; failures: CriticFailure[] }> {
  const { sessionId } = await bootstrapSession();
  const res = await api<CriticResponse>("/critic", {
    method: "POST",
    sessionId,
    apiKey,
    body: requirementIds === undefined ? {} : { requirementIds },
  });
  return {
    requirements: res.state.prd.functionalRequirements.map(({ id, status, flag }) => ({
      id,
      status,
      flag,
    })),
    failures: res.failures,
  };
}

/* Codes where a second attempt cannot help (the key itself is the problem). */
export function isRetryableFailure(failure: CriticFailure): boolean {
  return failure.code !== "LLM_UNAUTHORIZED" && failure.code !== "LLM_PAYMENT_REQUIRED";
}
