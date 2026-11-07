import type { CogneeInstance } from "../instances/types";
import type { PipelineRun, SessionDetail } from "./getSessions";
import { HttpError, toHttpError } from "@/services/http/errors";

export type RecordedRun = Omit<PipelineRun, "status"> & {
  status: string | null;
  embedding_tokens: number | null;
};
export type SessionIdentity = { sessionId: string; userId: string };
export type RunPage = { rows: RecordedRun[]; nextOffset: number | null };
export class RecordingSchemaError extends Error {}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RecordingSchemaError("Invalid native API response");
  }
  return value as Record<string, unknown>;
}
function nullableString(value: unknown): boolean {
  return value === null || typeof value === "string";
}
function nullableNumber(value: unknown): boolean {
  return value === null || (typeof value === "number" && Number.isFinite(value));
}
function recordedRun(value: unknown): RecordedRun {
  const row = object(value);
  const strings = ["pipeline_name", "status", "dataset_id", "dataset_name", "owner_id",
    "owner_email", "created_at", "pipeline_run_id", "operation_name", "origin", "outcome",
    "error_class", "started_at", "ended_at", "user_id", "parent_operation_id"];
  if (typeof row.id !== "string" || !row.id ||
      !["pipeline", "operation"].includes(String(row.kind)) ||
      !strings.every((field) => nullableString(row[field])) ||
      !["tokens_in", "tokens_out", "embedding_tokens"].every((field) => nullableNumber(row[field])) ||
      !(row.background === null || typeof row.background === "boolean") ||
      !Array.isArray(row.session_ids) || !row.session_ids.every((id) => typeof id === "string")) {
    throw new RecordingSchemaError("Invalid pipeline-runs row; native v1.6.7 contract required");
  }
  return row as unknown as RecordedRun;
}

/** Native bare-array feed. Offset pages are not a snapshot or a total count. */
export async function getRecordedRuns(instance: CogneeInstance,
  query: { sessionId?: string; offset: number }, signal: AbortSignal): Promise<RunPage> {
  const params = new URLSearchParams({ limit: "50", offset: String(query.offset) });
  if (query.sessionId !== undefined) params.set("session_id", query.sessionId);
  const response = await instance.fetch(`/v1/activity/pipeline-runs?${params}`, { signal });
  if (!response.ok) return toHttpError(response);
  const data: unknown = await response.json();
  if (!Array.isArray(data)) throw new RecordingSchemaError("Expected pipeline-runs bare array");
  const rows = data.map(recordedRun);
  return { rows, nextOffset: rows.length === 50 ? query.offset + 50 : null };
}

/** No capability probes or swallowed errors. Reject ambiguous owner responses. */
export async function getSessionDetailStrict(instance: CogneeInstance,
  identity: SessionIdentity, signal: AbortSignal): Promise<SessionDetail> {
  const response = await instance.fetch(`/v1/sessions/${encodeURIComponent(identity.sessionId)}`, { signal });
  if (!response.ok) return toHttpError(response);
  const row = object(await response.json());
  if (row.session_id !== identity.sessionId || row.user_id !== identity.userId) {
    throw new RecordingSchemaError("Session owner did not match the selection; native detail endpoint cannot disambiguate this session ID.");
  }
  if (!Array.isArray(row.qas) || !Array.isArray(row.traces) ||
      !["tokens_in", "tokens_out", "cost_usd"].every((field) => nullableNumber(row[field])) ||
      !["dataset_id", "started_at", "ended_at", "last_activity_at", "last_model", "label"].every((field) => nullableString(row[field])) ||
      typeof row.status !== "string" ||
      typeof row.msg_count !== "number" || typeof row.tool_calls !== "number") {
    throw new RecordingSchemaError("Invalid session detail response");
  }
  return row as unknown as SessionDetail;
}

/** Only explicit composite ownership proves association; datasets prove nothing. */
export function selectSessionRecords(identity: SessionIdentity, rows: readonly RecordedRun[]): RecordedRun[] {
  return rows.filter((row) => row.user_id === identity.userId && row.session_ids.includes(identity.sessionId));
}

/** Processing view keeps the newest recorded state per pipeline run, without usage sums. */
export function selectSessionProcessing(identity: SessionIdentity, rows: readonly RecordedRun[]): RecordedRun[] {
  const states = new Map<string, RecordedRun>();
  for (const row of selectSessionRecords(identity, rows)) {
    const key = row.kind === "pipeline" && row.pipeline_run_id ? `pipeline:${row.pipeline_run_id}` : `row:${row.id}`;
    const previous = states.get(key);
    if (!previous || `${row.created_at ?? ""}|${row.id}` > `${previous.created_at ?? ""}|${previous.id}`) states.set(key, row);
  }
  return [...states.values()].sort((a, b) => `${b.created_at ?? ""}|${b.id}`.localeCompare(`${a.created_at ?? ""}|${a.id}`));
}

export function mergeRecordedRows(previous: readonly RecordedRun[], page: readonly RecordedRun[]): RecordedRun[] {
  const rows = new Map(previous.map((row) => [row.id, row]));
  for (const row of page) if (!rows.has(row.id)) rows.set(row.id, row);
  return [...rows.values()];
}
export function recordingError(error: unknown): string {
  const status = error && typeof error === "object" && "status" in error ? error.status : null;
  if (status === 401) return "Sign in required (401).";
  if (status === 403) return "Permission denied (403).";
  if (status === 404) return "Session unavailable or not visible (404).";
  return error instanceof Error ? error.message : "Unable to read native records.";
}
export function isAccessDenied(error: unknown): boolean {
  return error instanceof HttpError && [401, 403].includes(error.status);
}
export const HISTORY_NOTICE = "Recording is best-effort; historical session links were not backfilled. Missing links do not establish whether memory was saved. Offset paging is not a snapshot and may miss rows as new records arrive; Refresh reads the newest page.";
export const BACKGROUND_NOTICE = "Background is recorded metadata: generic background success may mean acceptance/start; improve defers its record until the call finishes. Neither proves completion of every child stage or the whole lifecycle.";
