import { getRecordedRuns, getSessionDetailStrict, mergeRecordedRows, latestSessionRecords, selectSessionRecords, RecordingSchemaError } from "../sessionOperations";
import type { CogneeInstance } from "@/modules/instances/types";
import { run, detail } from "../testSupport/recordedFixtures";
const identity = { userId: "owner", sessionId: "A" };
const signal = new AbortController().signal;
function instance(data: unknown, status = 200): CogneeInstance {
  return { name: "LocalCognee", instanceId: "local", fetch: jest.fn(async () => new Response(JSON.stringify(data), { status })) };
}
it("two sessions sharing a dataset: only A has recorded processing", () => {
  const rows = [run(), run({ id: "unstamped", session_ids: [] })];
  expect(latestSessionRecords(identity, rows)).toEqual([rows[0]]);
  expect(latestSessionRecords({ ...identity, sessionId: "B" }, rows)).toEqual([]);
});
it("requires the composite owner, retains datasetless and multi-session links", () => {
  const rows = [run({ id: "other-owner", user_id: "other" }), run({ id: "datasetless", dataset_id: null, session_ids: ["A", "B"] }), run({ id: "unknown-owner", user_id: null })];
  expect(selectSessionRecords(identity, rows).map((r) => r.id)).toEqual(["datasetless"]);
  expect(selectSessionRecords({ ...identity, sessionId: "B" }, rows).map((r) => r.id)).toEqual(["datasetless"]);
});
it("collapses only explicit pipeline run state across pages, never parent/child or time bursts", () => {
  const rows = [run(), run({ id: "child-start", kind: "pipeline", parent_operation_id: "run-1", pipeline_run_id: "child", status: "STARTED" }),
    run({ id: "child-end", kind: "pipeline", parent_operation_id: "run-1", pipeline_run_id: "child", status: "COMPLETED", created_at: "2026-01-01T00:01:00Z" }),
    run({ id: "separate", pipeline_run_id: "other" })];
  expect(latestSessionRecords(identity, rows).map((r) => r.id)).toEqual(["child-end", "separate", "row-1"]);
  expect(mergeRecordedRows(rows, [rows[0]])).toHaveLength(4);
});
it("reads native bare-array pages of 50, encoded session only, with cancellation", async () => {
  const source = instance(Array.from({ length: 50 }, (_, i) => run({ id: String(i) })));
  const page = await getRecordedRuns(source, { sessionId: "A / B", offset: 50 }, signal);
  expect(page.nextOffset).toBe(100);
  expect(source.fetch).toHaveBeenCalledWith("/v1/activity/pipeline-runs?limit=50&offset=50&session_id=A+%2F+B", { signal, authErrors: "throw" });
  expect((await getRecordedRuns(instance([]), { offset: 0 }, signal)).nextOffset).toBeNull();
});
it("preserves null, zero, noop, unknown and background literally", async () => {
  const row = run({ status: "FUTURE_STATE", outcome: "noop" });
  expect((await getRecordedRuns(instance([row]), { offset: 0 }, signal)).rows).toEqual([row]);
});
it.each([{}, [run({ tokens_in: undefined })], [run({ session_ids: undefined })], [run({ status: 42 as unknown as string })]])("rejects invalid native schema %j", async (data) => {
  await expect(getRecordedRuns(instance(data), { offset: 0 }, signal)).rejects.toBeInstanceOf(RecordingSchemaError);
});
it.each([401, 403, 500])("throws status %i instead of empty history", async (status) => {
  await expect(getRecordedRuns(instance({ detail: "denied" }, status), { offset: 0 }, signal)).rejects.toMatchObject({ status });
});
it("rejects another owner's detail for an identical session ID", async () => {
  await expect(getSessionDetailStrict(instance(detail({ user_id: "other" })), identity, signal)).rejects.toThrow("owner did not match");
  await expect(getSessionDetailStrict(instance(detail()), identity, signal)).resolves.toEqual(detail());
});

it("keeps operation row IDs separate from pipeline run IDs", () => {
  const rows = [run({ id: "shared-id" }), run({ id: "pipeline-state", kind: "pipeline", pipeline_run_id: "shared-id" })];
  expect(latestSessionRecords(identity, rows)).toHaveLength(2);
});
