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
  listSessions: async () => ({ sessions }), getSessionStats: async () => null,
}));
beforeEach(() => {
  sessions.splice(0, sessions.length, detail(), detail({ session_id: "B" }));
  fetch.mockReset();
  fetch.mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
    url.startsWith("/v1/sessions/") ? detail({ session_id: decodeURIComponent(url.split("/").pop()!) }) : [run({ operation_name: "processed-A" })]
  ))));
});
it("keeps processing separate from effective status and the transcript; B cannot inherit A's dataset processing", async () => {
  render(<SessionsPage />);
  fireEvent.click(await screen.findByRole("button", { name: /^A / }));
  expect(await screen.findByText("processed-A")).toBeInTheDocument();
  expect(await screen.findByText("Session effective status")).toBeInTheDocument();
  expect(screen.getByText(/latest 20 Q&As/)).toBeInTheDocument();
  expect(screen.getByText("Cost").parentElement).toHaveTextContent("Not recorded");
  fireEvent.click(screen.getByRole("button", { name: /^B / }));
  expect(screen.queryByText("processed-A")).not.toBeInTheDocument();
  await waitFor(() => expect(screen.getByText("No linked processing records available.")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "View raw records in Activity" })).toHaveAttribute("href", "/activity?session=B&owner=owner");
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
