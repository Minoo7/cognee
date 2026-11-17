import { act, fireEvent, render, screen, within } from "@testing-library/react";
import Page from "../page";
import { listSessions } from "@/modules/sessions/getSessions";
const owner = "11111111-1111-4111-8111-111111111111";
const fetch = jest.fn();
const instance = { name: "local", instanceId: "local", fetch };
let activeInstance: typeof instance | null = instance;
jest.mock("@/modules/tenant/TenantProvider", () => ({ useCogniInstance: () => ({ cogniInstance: activeInstance, isInitializing: false }) }));
jest.mock("@/modules/sessions/getSessions", () => ({ listSessions: jest.fn(), channelForSessionId: () => "API" }));
const row = (session_id = "s") => ({ session_id, user_id: owner, last_activity_at: null });
const page = (session = "s", more = false) => ({ sessions: [row(session)], has_more: more });
const coverage = () => {
  const item = { received: { state: "counted", count: 2 }, checkpoint: { state: "recorded", count: 1, updated_at: null }, comparison: { state: "difference", count: 1 } };
  return { owner_id: owner, session_id: "s", dataset_id: null, observed_at: "2026-11-17T00:00:00+00:00", qa: item, trace: item };
};
beforeEach(() => {
  window.history.replaceState(null, "", "/memory-gap-analysis");
  activeInstance = instance;
  fetch.mockReset().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(coverage()))));
  (listSessions as jest.Mock).mockReset().mockResolvedValue(page());
});
it("fetches only selected coverage, stores its URL and renders literal metadata", async () => {
  render(<Page />);
  const choose = await screen.findByRole("button", { name: `s · ${owner}` });
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(choose);
  const category = await screen.findByRole("region", { name: "Q/A records" });
  expect(within(category).getByText("Received and currently retained: 2")).toBeInTheDocument();
  expect(within(category).getByText("Recorded persistence checkpoint: 1")).toBeInTheDocument();
  expect(within(category).getByText("Difference from recorded checkpoint: 1")).toBeInTheDocument();
  expect(choose).toHaveAttribute("aria-pressed", "true");
  const params = new URLSearchParams(window.location.search);
  expect(params.get("session")).toBe("s");
  expect(params.get("owner")).toBe(owner);
  expect(screen.getByRole("link", { name: "View recorded processing in Activity" })).toHaveAttribute("href", `/activity?session=s&owner=${owner}`);
  expect(screen.getByText(/cannot report turns it never received/)).toBeInTheDocument();
});
it("loads an exact session and owner from a reloadable URL", async () => {
  window.history.replaceState(null, "", `/memory-gap-analysis?session=s&owner=${owner}`);
  render(<Page />);
  await screen.findByRole("region", { name: "Q/A records" });
  expect(fetch.mock.calls[0][0]).toBe(`/v1/sessions/s/coverage?owner_id=${owner}`);
  expect(await screen.findByRole("button", { name: `s · ${owner}` })).toHaveAttribute("aria-pressed", "true");
});
it("pages the inventory without fetching every session body", async () => {
  (listSessions as jest.Mock).mockResolvedValueOnce(page("s", true)).mockResolvedValueOnce(page("second"));
  render(<Page />);
  await screen.findByRole("button", { name: `s · ${owner}` });
  expect(screen.getByRole("button", { name: "Previous sessions" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Next sessions" }));
  await screen.findByRole("button", { name: `second · ${owner}` });
  expect(listSessions).toHaveBeenLastCalledWith(instance, { range: "all", limit: 50, offset: 50 }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(fetch).not.toHaveBeenCalled();
});
it("shows an inventory failure distinctly and retries", async () => {
  (listSessions as jest.Mock).mockResolvedValueOnce({ sessions: [], has_more: false, failed: true });
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to read sessions");
  expect(screen.queryByText("No sessions on this page.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry sessions" }));
  await screen.findByRole("button", { name: `s · ${owner}` });
});
it("rejects old inventory responses after the instance changes", async () => {
  let resolveOld!: (value: unknown) => void;
  let resolveNew!: (value: unknown) => void;
  (listSessions as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; })).mockReturnValueOnce(new Promise((resolve) => { resolveNew = resolve; }));
  const view = render(<Page />);
  const signal = (listSessions as jest.Mock).mock.calls[0][2].signal;
  activeInstance = { ...instance, instanceId: "second" };
  view.rerender(<Page />);
  expect(signal.aborted).toBe(true);
  await act(async () => resolveNew(page("second")));
  await screen.findByRole("button", { name: `second · ${owner}` });
  await act(async () => resolveOld(page()));
  expect(screen.queryByRole("button", { name: `s · ${owner}` })).not.toBeInTheDocument();
});
it("ends loading when there is no connected instance", () => {
  activeInstance = null;
  render(<Page />);
  expect(screen.getByRole("alert")).toHaveTextContent("No Cognee instance is connected");
  expect(screen.queryByText("Loading sessions…")).not.toBeInTheDocument();
  expect(listSessions).not.toHaveBeenCalled();
});
