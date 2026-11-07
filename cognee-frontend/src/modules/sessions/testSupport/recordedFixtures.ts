import type { RecordedRun } from "../sessionOperations";
import type { SessionDetail } from "../getSessions";
export function run(overrides: Partial<RecordedRun> = {}): RecordedRun {
  return { id: "row-1", kind: "operation", pipeline_name: null, status: null, operation_name: "improve",
    dataset_id: "same-dataset", dataset_name: "Shared", owner_id: "owner", owner_email: null,
    created_at: "2026-01-01T00:00:00Z", pipeline_run_id: "run-1", origin: "sdk", outcome: "succeeded",
    background: true, error_class: null, tokens_in: null, tokens_out: 0, embedding_tokens: null,
    started_at: null, ended_at: null, user_id: "owner", session_ids: ["A"], parent_operation_id: null, ...overrides };
}
export function detail(overrides: Partial<SessionDetail> = {}): SessionDetail {
  return { session_id: "A", user_id: "owner", dataset_id: "same-dataset", status: "running", effective_status: "running",
    started_at: null, last_activity_at: null, ended_at: null, tokens_in: null, tokens_out: 0, cost_usd: null,
    error_count: 0, last_model: null, label: null, msg_count: 0, tool_calls: 0, qas: [], traces: [], ...overrides };
}
