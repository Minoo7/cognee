import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SessionsPage from "../page";
import { detail, run } from "@/modules/sessions/testSupport/recordedFixtures";
const fetch = jest.fn();
const instance = { name: "LocalCognee", instanceId: "local", fetch };
const sessions = [detail(), detail({ session_id: "B" })];
jest.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams() }));
jest.mock("@/modules/tenant/TenantProvider", () => ({ useCogniInstance: () => ({ cogniInstance: instance, isInitializing: false }) }));
jest.mock("@/modules/analytics", () => ({ TrackPageView: () => null }));
jest.mock("@/modules/sessions/getSessions", () => ({
  ...jest.requireActual("@/modules/sessions/getSessions"),
  listSessions: async () => ({ sessions }),
  // Native stats report success_rate=1 when no sessions have a decided status.
  getSessionStats: async () => ({ sessions: 2, completed: 0, failed: 0, abandoned: 0, running: 2, success_rate: 1 }),
}));
beforeEach(() => {
  sessions.splice(0, sessions.length, detail(), detail({ session_id: "B" }));
  fetch.mockReset();
  fetch.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.startsWith("/v1/sessions/") ? detail({ session_id: decodeURIComponent(url.split("/").pop()!) }) : [run({ operation_name: "processed-A" })]
  ))));
});

it("does not label undecided native sessions as successful processing", async () => {
  render(<SessionsPage />);
  expect(await screen.findByText("· 2 sessions")).toBeInTheDocument();
  expect(screen.queryByText(/% success/)).not.toBeInTheDocument();
});
it("keeps processing separate from effective status and the transcript; B cannot inherit A's dataset processing", async () => {
  render(<SessionsPage />);
  fireEvent.click(await screen.findByRole("button", { name: /^A / }));
  expect(await screen.findByText("processed-A")).toBeInTheDocument();
  expect(await screen.findByText("Session recorded status")).toBeInTheDocument();
  expect(screen.getByText(/latest 20 Q&As/)).toBeInTheDocument();
  expect(screen.getByText("Cost").parentElement).toHaveTextContent("Not recorded");
  fireEvent.click(screen.getByRole("button", { name: /^B / }));
  expect(screen.queryByText("processed-A")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("No linked processing records available.")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "View raw records in Activity" })).toHaveAttribute("href", "/activity?session=B&owner=owner");
});

it("renders native session Q/A detail without the list-only effective status", async () => {
  const nativeDetail = detail({
    tokens_in: 0, tokens_out: 0, cost_usd: 0, msg_count: 1,
    qas: [{ question: "What was saved?", answer: "A disposable local Q/A." }],
  });
  expect(nativeDetail).not.toHaveProperty("effective_status");
  fetch.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.startsWith("/v1/sessions/") ? nativeDetail : []
  ))));
  render(<SessionsPage />);
  fireEvent.click(await screen.findByRole("button", { name: /^A / }));
  fireEvent.click(await screen.findByRole("button", { name: /What was saved\?/ }));
  expect(await screen.findByText("A disposable local Q/A.")).toBeInTheDocument();
  expect(screen.getByText("Session recorded status").parentElement).toHaveTextContent("running");
  expect(screen.queryByText("Session effective status")).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("distinguishes identical session IDs by displayed owner and rejects mismatched detail", async () => {
  sessions.splice(0, sessions.length, detail(), detail({ user_id: "other" }));
  fetch.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.startsWith("/v1/sessions/") ? detail() : [run({ operation_name: "owner-only" }), run({ id: "other-run", user_id: "other", operation_name: "other-only" })]
  ))));
  render(<SessionsPage />);
  fireEvent.click(await screen.findByRole("button", { name: /^A Owner: other / }));
  expect(await screen.findByText("other-only")).toBeInTheDocument();
  expect(screen.queryByText("owner-only")).not.toBeInTheDocument();
  expect(await screen.findByRole("alert")).toHaveTextContent("owner did not match");
  expect(screen.getByRole("link", { name: "View raw records in Activity" })).toHaveAttribute("href", "/activity?session=A&owner=other");
});
