import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import Page from "../page";
import SelfImprovementCard from "../../sessions/partials/SelfImprovementCard";
import { useRecordedRuns } from "../../sessions/partials/useSessionProcessing";
import { run } from "@/modules/sessions/testSupport/recordedFixtures";
let params = new URLSearchParams();
const fetch = jest.fn();
const instance = { name: "LocalCognee", instanceId: "local", fetch };
jest.mock("next/navigation", () => ({ useSearchParams: () => params }));
jest.mock("@/modules/tenant/TenantProvider", () => ({ useCogniInstance: () => ({ cogniInstance: instance, isInitializing: false }) }));
beforeEach(() => { params = new URLSearchParams(); fetch.mockReset(); });
function response(rows: unknown, status = 200) { return new Response(JSON.stringify(rows), { status }); }
it("renders raw native fields, null versus zero and literal noop/unknown with no fabricated success", async () => {
  fetch.mockResolvedValue(response([run({ outcome: "noop", status: "FUTURE", dataset_id: null })]));
  render(<Page />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading activity");
  expect(await screen.findByText("Outcome: noop")).toBeInTheDocument();
  expect(screen.getByText("Status: FUTURE")).toBeInTheDocument();
  expect(screen.getByText("Tokens in: not measured")).toBeInTheDocument();
  expect(screen.getByText("Tokens out: 0")).toBeInTheDocument();
  expect(screen.getByText("Background: true")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "A" })).toHaveAttribute("href", "/sessions?session=A&owner=owner");
});
it("composite filter excludes same-dataset B, unstamped records and other owners", async () => {
  params = new URLSearchParams({ session: "A", owner: "owner" });
  fetch.mockResolvedValue(response([run({ operation_name: "only-A" }), run({ id: "B", session_ids: ["B"], operation_name: "only-B" }), run({ id: "old", session_ids: [], operation_name: "unstamped" }), run({ id: "other", user_id: "other", operation_name: "wrong-owner" })]));
  render(<Page />);
  expect(await screen.findByText("only-A")).toBeInTheDocument();
  expect(screen.queryByText("only-B")).not.toBeInTheDocument();
  expect(screen.queryByText("unstamped")).not.toBeInTheDocument();
  expect(screen.queryByText("wrong-owner")).not.toBeInTheDocument();
});
it.each([401, 403])("displays %i with retry, never a false empty state", async (status) => {
  fetch.mockResolvedValueOnce(response({}, status)).mockResolvedValueOnce(response([]));
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent(String(status));
  expect(screen.queryByText("No recorded activity available.")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByText("No recorded activity available.")).toBeInTheDocument();
});
it("offers Load more for full pages, marks failed page stale, then refreshes", async () => {
  fetch.mockResolvedValueOnce(response(Array.from({ length: 50 }, (_, i) => run({ id: String(i) })))).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(response([]));
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("offline");
  expect(screen.getByText("Stale records retained after a read failure.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Refresh" }));
  expect(await screen.findByText("No recorded activity available.")).toBeInTheDocument();
});
it("refuses a session link without owner instead of broadening the feed", async () => {
  params = new URLSearchParams({ session: "A" });
  render(<Page />);
  expect(screen.getByRole("alert")).toHaveTextContent("requires both session and owner");
  expect(fetch).not.toHaveBeenCalled();
});
it("session card for unstamped history says unavailable, never claims a saving failure", async () => {
  fetch.mockResolvedValue(response([run({ session_ids: [] })]));
  function Card() { const history = useRecordedRuns(instance, { sessionId: "A", userId: "owner" }); return <SelfImprovementCard identity={{ sessionId: "A", userId: "owner" }} history={history} />; }
  render(<Card />);
  await waitFor(() => expect(screen.getByText("No linked processing records available.")).toBeInTheDocument());
  expect(screen.getByRole("link", { name: "View raw records in Activity" })).toHaveAttribute("href", "/activity?session=A&owner=owner");
  expect(screen.queryByText(/saving failed/i)).not.toBeInTheDocument();
});
