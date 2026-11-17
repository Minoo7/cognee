import { act, renderHook, waitFor } from "@testing-library/react";
import { getSessionCoverage, parseSessionCoverage, CoverageUnsupportedError } from "../sessionCoverage";
import { useSessionCoverage } from "../useSessionCoverage";
import type { CogneeInstance } from "@/modules/instances/types";
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const identity = { sessionId: "A", userId: owner };
function fixture(userId = owner, sessionId = "A") {
  const item = { received: { state: "counted", count: 0 }, checkpoint: { state: "missing" }, comparison: { state: "not_comparable" } };
  return { owner_id: userId, session_id: sessionId, dataset_id: null, observed_at: "2026-11-17T00:00:00+00:00", qa: item, trace: item };
}
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status }); }
function source(fetch: jest.Mock, instanceId = "local"): CogneeInstance { return { name: "local", instanceId, fetch }; }
it("validates all independent states and rejects malformed counts and identity", () => {
  for (const state of ["unavailable", "read_error"]) {
    const raw = fixture(); raw.qa.received = { state, count: 0 };
    expect(parseSessionCoverage(raw, identity).qa.received.state).toBe(state);
  }
  for (const state of ["missing", "malformed", "unavailable", "read_error"]) {
    const raw = fixture(); raw.qa.checkpoint.state = state;
    expect(parseSessionCoverage(raw, identity).qa.checkpoint.state).toBe(state);
  }
  for (const value of [true, -1, 1.1, "0", null]) {
    const raw = { ...fixture(), qa: { received: { state: "counted", count: value }, checkpoint: { state: "missing" }, comparison: { state: "not_comparable" } } };
    expect(() => parseSessionCoverage(raw, identity)).toThrow();
  }
  expect(() => parseSessionCoverage(fixture(other), identity)).toThrow();
  for (const n of [0, 1, 3]) {
    const raw = { ...fixture(), qa: { received: { state: "counted", count: 1 }, checkpoint: { state: "recorded", count: n, updated_at: null }, comparison: n > 1 ? { state: "inconsistent_history" } : { state: "difference", count: 1 - n } } };
    expect(parseSessionCoverage(raw, identity).qa.comparison).toEqual(raw.qa.comparison);
  }
});
it("distinguishes unsupported route from concealed session 404", async () => {
  const fetch = jest.fn().mockResolvedValueOnce(response({ detail: "Not Found" }, 404)).mockResolvedValueOnce(response({ detail: "session not found" }, 404));
  const instance = source(fetch);
  await expect(getSessionCoverage(instance, identity, new AbortController().signal)).rejects.toBeInstanceOf(CoverageUnsupportedError);
  await expect(getSessionCoverage(instance, identity, new AbortController().signal)).rejects.toMatchObject({ status: 404 });
  expect(fetch.mock.calls[0][0]).toContain(`owner_id=${owner}`);
});
it.each(["owner", "session", "instance"])("hides and aborts stale responses across %s changes", async (change) => {
  let resolveOld!: (r: Response) => void;
  let resolveNew!: (r: Response) => void;
  const oldResponse = new Promise<Response>((resolve) => { resolveOld = resolve; });
  const newResponse = new Promise<Response>((resolve) => { resolveNew = resolve; });
  const fetch = jest.fn().mockReturnValueOnce(oldResponse).mockReturnValueOnce(newResponse);
  const instance = source(fetch);
  const { result, rerender } = renderHook(({ current, selected }) => useSessionCoverage(current, selected), { initialProps: { current: instance, selected: identity } });
  const signal = fetch.mock.calls[0][1].signal;
  const selected = change === "owner" ? { ...identity, userId: other } : change === "session" ? { ...identity, sessionId: "B" } : identity;
  const next = change === "instance" ? source(jest.fn().mockReturnValue(newResponse), "second") : instance;
  rerender({ current: next, selected });
  expect(result.current.data).toBeNull();
  expect(signal.aborted).toBe(true);
  await act(async () => resolveOld(response(fixture())));
  expect(result.current.data).toBeNull();
  expect(result.current.error).toBeNull();
  expect(result.current.loading).toBe(true);
  await act(async () => resolveNew(response(fixture(selected.userId, selected.sessionId))));
  await waitFor(() => expect(result.current.data?.owner_id).toBe(selected.userId));
  expect(result.current.data?.session_id).toBe(selected.sessionId);
});
it("retains stale facts on refresh failure, retries, then clears denial", async () => {
  const fetch = jest.fn().mockResolvedValue(response(fixture()));
  const instance = source(fetch);
  const { result } = renderHook(() => useSessionCoverage(instance, identity));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  fetch.mockResolvedValue(response({}, 500)); act(() => result.current.refresh());
  await waitFor(() => expect(result.current.stale).toBe(true));
  fetch.mockResolvedValue(response(fixture())); act(() => result.current.refresh());
  await waitFor(() => expect(result.current.stale).toBe(false));
  fetch.mockResolvedValue(response({}, 403)); act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toContain("403"));
  expect(result.current.data).toBeNull();
});

it("hides loaded previous-owner facts while the replacement request is pending", async () => {
  const fetch = jest.fn().mockResolvedValue(response(fixture()));
  const instance = source(fetch);
  const { result, rerender } = renderHook(({ selected }) => useSessionCoverage(instance, selected), { initialProps: { selected: identity } });
  await waitFor(() => expect(result.current.data?.owner_id).toBe(owner));
  fetch.mockReturnValue(new Promise(() => {}));
  rerender({ selected: { ...identity, userId: other } });
  expect(result.current.data).toBeNull();
});

it("recognizes unsupported routes when the native instance throws before returning a Response", async () => {
  const { HttpError } = await import("@/services/http/errors");
  const fetch = jest.fn().mockRejectedValue(new HttpError(404, "Not Found", "Not Found", { detail: "Not Found" }));
  await expect(getSessionCoverage(source(fetch), identity, new AbortController().signal)).rejects.toBeInstanceOf(CoverageUnsupportedError);
});

it.each([401, 403, 404])("clears retained facts after a %s response", async (status) => {
  const fetch = jest.fn().mockResolvedValueOnce(response(fixture())).mockResolvedValueOnce(response({}, status));
  const instance = source(fetch);
  const { result } = renderHook(() => useSessionCoverage(instance, identity));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toContain(String(status)));
  expect(result.current.data).toBeNull();
  expect(result.current.stale).toBe(false);
});

it.each([401, 403, 404])("clears previously loaded facts on denial %s", async (status) => {
  const fetch = jest.fn().mockResolvedValueOnce(response(fixture())).mockResolvedValueOnce(response({ detail: "session not found" }, status));
  const instance = source(fetch);
  const { result } = renderHook(() => useSessionCoverage(instance, identity));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  act(() => result.current.refresh());
  await waitFor(() => expect(result.current.error).toContain(String(status)));
  expect(result.current.data).toBeNull();
  expect(result.current.stale).toBe(false);
});
