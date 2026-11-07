import { render, screen, waitFor } from "@testing-library/react";
import { LocalProvider } from "../LocalProvider";
import { useTenant } from "../TenantContext";
import { useUser } from "@/modules/users/UserContext";

function Probe() {
  const { isOwner, tenant } = useTenant();
  const { availableTenants } = useUser();
  return (
    <>
      <span data-testid="is-owner">{String(isOwner)}</span>
      <span data-testid="tenant-id">{tenant?.tenant_id ?? "none"}</span>
      <span data-testid="tenant-name">{tenant?.tenant_name ?? "none"}</span>
      <span data-testid="tenant-count">{availableTenants.length}</span>
      <span data-testid="owned-count">
        {availableTenants.filter((t) => t.isOwner).length}
      </span>
      <span data-testid="subscription-active">
        {String(availableTenants[0]?.ownerHasSubscription ?? false)}
      </span>
    </>
  );
}

describe("LocalProvider ownership", () => {
  beforeEach(() => {
    // LocalProvider skips its auth probe on the login page, which would leave
    // tenant null; pretend we are anywhere else.
    window.history.replaceState({}, "", "/dashboard");
    fetchMock.resetMocks();
  });

  it("shows the authenticated user's active backend tenant", async () => {
    fetchMock.mockResponses(
      [JSON.stringify({ email: "vincent@planasolutions.ai", tenant_id: "tenant-1" }), { status: 200 }],
      [JSON.stringify([{ id: "tenant-1", name: "plana-team", is_owner: false }]), { status: 200 }],
    );

    render(
      <LocalProvider>
        <Probe />
      </LocalProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tenant-id")).toHaveTextContent("tenant-1");
    });
    expect(screen.getByTestId("tenant-name")).toHaveTextContent("plana-team");
    expect(screen.getByTestId("is-owner")).toHaveTextContent("false");
  });

  it("exposes real memberships and server-derived ownership", async () => {
    fetchMock.mockResponses(
      [JSON.stringify({ tenant_id: "tenant-owner" }), { status: 200 }],
      [JSON.stringify([
        { id: "tenant-owner", name: "Owned team", is_owner: true },
        { id: "tenant-member", name: "Member team", is_owner: false },
      ]), { status: 200 }],
    );

    render(
      <LocalProvider>
        <Probe />
      </LocalProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tenant-id")).toHaveTextContent("tenant-owner");
    });
    expect(screen.getByTestId("is-owner")).toHaveTextContent("true");
    expect(screen.getByTestId("owned-count")).toHaveTextContent("2");
    expect(screen.getByTestId("tenant-count")).toHaveTextContent("3");
    expect(screen.getByTestId("subscription-active")).toHaveTextContent("true");
  });

  it("does not claim ownership before the tenant is resolved", () => {
    // Probe never resolves, so tenant stays null. isOwner must stay false
    // rather than defaulting to true, matching the cloud behaviour.
    fetchMock.mockResponseOnce(() => new Promise(() => {}));

    render(
      <LocalProvider>
        <Probe />
      </LocalProvider>,
    );

    expect(screen.getByTestId("tenant-id")).toHaveTextContent("none");
    expect(screen.getByTestId("is-owner")).toHaveTextContent("false");
  });
});
