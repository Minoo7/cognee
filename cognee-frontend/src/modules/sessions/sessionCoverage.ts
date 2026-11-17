import * as v from "valibot";
import type { CogneeInstance } from "../instances/types";
import type { SessionIdentity } from "./sessionOperations";
import { HttpError, toHttpError } from "@/services/http/errors";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const date = v.pipe(v.string(), v.isoTimestamp());
const received = v.variant("state", [
  v.object({ state: v.literal("counted"), count }),
  v.object({ state: v.literal("unavailable") }),
  v.object({ state: v.literal("read_error") }),
]);
const checkpoint = v.variant("state", [
  v.object({ state: v.literal("recorded"), count, updated_at: v.nullable(date) }),
  v.object({ state: v.literal("missing") }),
  v.object({ state: v.literal("malformed") }),
  v.object({ state: v.literal("unavailable") }),
  v.object({ state: v.literal("read_error") }),
]);
const comparison = v.variant("state", [
  v.object({ state: v.literal("difference"), count }),
  v.object({ state: v.literal("inconsistent_history") }),
  v.object({ state: v.literal("not_comparable") }),
]);
const category = v.object({ received, checkpoint, comparison });
const schema = v.object({
  session_id: v.string(), owner_id: v.pipe(v.string(), v.uuid()),
  dataset_id: v.nullable(v.pipe(v.string(), v.uuid())), observed_at: date,
  qa: category, trace: category,
});
export type SessionCoverage = v.InferOutput<typeof schema>;
export type CoverageCategory = SessionCoverage["qa"];
export class CoverageUnsupportedError extends Error {}

export function parseSessionCoverage(raw: unknown, identity: SessionIdentity): SessionCoverage {
  const data = v.parse(schema, raw);
  if (data.session_id !== identity.sessionId || data.owner_id !== identity.userId) {
    throw new Error("Coverage identity mismatch");
  }
  for (const item of [data.qa, data.trace]) {
    if (item.received.state === "counted" && item.checkpoint.state === "recorded") {
      const delta = item.received.count - item.checkpoint.count;
      if (delta >= 0 ? item.comparison.state !== "difference" || item.comparison.count !== delta
        : item.comparison.state !== "inconsistent_history") throw new Error("Invalid coverage comparison");
    } else if (item.comparison.state !== "not_comparable") throw new Error("Invalid coverage comparison");
  }
  return data;
}

export async function getSessionCoverage(instance: CogneeInstance, identity: SessionIdentity,
  signal: AbortSignal): Promise<SessionCoverage> {
  const params = new URLSearchParams({ owner_id: identity.userId });
  try {
    const response = await instance.fetch(`/v1/sessions/${encodeURIComponent(identity.sessionId)}/coverage?${params}`,
      { signal, authErrors: "throw", timeoutMs: 20000 });
    if (!response.ok) return await toHttpError(response);
    return parseSessionCoverage(await response.json(), identity);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404 && error.body &&
      typeof error.body === "object" && error.body.detail === "Not Found") {
      throw new CoverageUnsupportedError("This server does not support native Memory Coverage.");
    }
    throw error;
  }
}
