import { act, renderHook, waitFor } from "@testing-library/react";
import { useRecordedRuns, useSessionProcessing } from "../useSessionProcessing";
import { run, detail } from "@/modules/sessions/testSupport/recordedFixtures";
import type { CogneeInstance } from "@/modules/instances/types";
const identity = { sessionId: "A", userId: "owner" };
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }
function source(fetch: jest.Mock, id = "local"): CogneeInstance { return { name: "LocalCognee", instanceId: id, fetch }; }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
it("detail and history load independently and retry independently", async () => {
  const late = deferred<Response>();
  const fetch = jest.fn((url: string) => url.startsWith("/v1/sessions/") ? late.promise : Promise.resolve(response([run()])));
  const instance = source(fetch);
  const { result } = renderHook(() => useSessionProcessing(instance, identity));
  await waitFor(() => expect(result.current.history.rows).toHaveLength(1));
  expect(result.current.detailLoading).toBe(true);
  await act(async () => late.resolve(response({}, 404)));
  expect(result.current.detailError).toContain("404");
  expect(result.current.history.rows).toHaveLength(1);
  fetch.mockImplementation((url: string) => Promise.resolve(response(url.startsWith("/v1/sessions/") ? detail() : [])));
  act(() => result.current.retryDetail());
  await waitFor(() => expect(result.current.detail).not.toBeNull());
  expect(result.current.history.rows).toHaveLength(1);
});
it("aborts and rejects late responses across session, owner and instance switches", async () => {
  const first = deferred<Response>();
  const fetch = jest.fn((url: string, init?: RequestInit) => { void url; void init; return first.promise; });
  const instance = source(fetch);
  const { result, rerender } = renderHook(({ current, selected }) => useSessionProcessing(current, selected), { initialProps: { current: instance, selected: identity } });
  const oldSignal = fetch.mock.calls[0][1]!.signal!;
  const nextFetch = jest.fn(() => Promise.resolve(response([])));
  const next = source(nextFetch, "other-tenant");
  rerender({ current: next, selected: { sessionId: "B", userId: "other-owner" } });
  expect(result.current.detail).toBeNull(); expect(result.current.history.rows).toEqual([]);
  expect(oldSignal.aborted).toBe(true);
  await act(async () => first.resolve(response(detail())));
  await waitFor(() => expect(result.current.history.loading).toBe(false));
  expect(result.current.detail).toBeNull(); expect(result.current.history.rows).toEqual([]);
});
it("clears rows immediately when an identical session id belongs to another owner", async () => {
  const fetch = jest.fn(() => Promise.resolve(response([run(), run({ id: "other", user_id: "other" })])));
  const instance = source(fetch);
  const { result, rerender } = renderHook(({ selected }) => useRecordedRuns(instance, selected), { initialProps: { selected: identity } });
  await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["row-1"]));
  rerender({ selected: { ...identity, userId: "other" } });
  expect(result.current.rows).toEqual([]);
  await waitFor(() => expect(result.current.rows.map((r) => r.id)).toEqual(["other"]));
});
it("deduplicates offset pages by row id and retains latest state across pages", async () => {
  const rows = Array.from({ length: 50 }, (_, i) => run({ id: String(i) }));
  const fetch = jest.fn().mockResolvedValueOnce(response(rows)).mockResolvedValueOnce(response([rows[49], run({ id: "late" })]));
  const sourceInstance = source(fetch);
  const { result } = renderHook(() => useRecordedRuns(sourceInstance));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.nextOffset).toBe(50);
  act(() => { result.current.loadMore(); result.current.loadMore(); });
  await waitFor(() => expect(result.current.rows).toHaveLength(51));
  expect(fetch).toHaveBeenCalledTimes(2); expect(result.current.nextOffset).toBeNull();
});
it("refresh failure retains same-scope records as stale, while access denial clears them", async () => {
  const fetch = jest.fn().mockResolvedValueOnce(response([run()])).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response({}, 403));
  const instance = source(fetch);
  const { result } = renderHook(() => useRecordedRuns(instance));
  await waitFor(() => expect(result.current.rows).toHaveLength(1));
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.stale).toBe(true));
  expect(result.current.rows).toHaveLength(1); expect(result.current.error).toBe("offline");
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toContain("403"));
  expect(result.current.rows).toEqual([]); expect(result.current.stale).toBe(false);
});
it.each([401, 403])("history error %i leaves independently loaded detail intact", async (status) => {
  const instance = source(jest.fn((url: string) => Promise.resolve(url.startsWith("/v1/sessions/") ? response(detail()) : response({}, status))));
  const { result } = renderHook(() => useSessionProcessing(instance, identity));
  await waitFor(() => expect(result.current.history.error).toContain(String(status)));
  expect(result.current.detail).toEqual(detail());
});
