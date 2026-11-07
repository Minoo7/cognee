import {
  DEFAULT_LOCAL_SCOPE_ID,
  resolveLocalTenantState,
  selectLocalTenant,
} from "../localTenantApi";

describe("localTenantApi", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
  });

  it("represents the backend default scope without choosing a membership", () => {
    const state = resolveLocalTenantState(
      { tenant_id: null },
      [{ id: "tenant-1", name: "plana-team", is_owner: false }],
    );

    expect(state).toEqual({
      tenant: { tenant_id: DEFAULT_LOCAL_SCOPE_ID, tenant_name: "Personal Workspace" },
      availableTenants: [
        {
          id: DEFAULT_LOCAL_SCOPE_ID,
          name: "Personal Workspace",
          isOwner: true,
          ownerHasSubscription: true,
        },
        {
          id: "tenant-1",
          name: "plana-team",
          isOwner: false,
          ownerHasSubscription: true,
        },
      ],
    });
  });

  it("rejects an active tenant outside the user's memberships", () => {
    expect(() => resolveLocalTenantState(
      { tenant_id: "missing" },
      [{ id: "tenant-1", name: "plana-team", is_owner: false }],
    )).toThrow("Active tenant missing is missing from the authenticated user's memberships.");
  });

  it("keeps the personal workspace available while a team is active", () => {
    const state = resolveLocalTenantState(
      { tenant_id: "tenant-1" },
      [{ id: "tenant-1", name: "plana-team", is_owner: false }],
    );

    expect(state.tenant).toEqual({ tenant_id: "tenant-1", tenant_name: "plana-team" });
    expect(state.availableTenants).toContainEqual({
      id: DEFAULT_LOCAL_SCOPE_ID,
      name: "Personal Workspace",
      isOwner: true,
      ownerHasSubscription: true,
    });
  });

  it("posts the selected backend tenant", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ tenant_id: "tenant-1" }));

    await selectLocalTenant("http://localhost:8000", "tenant-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/permissions/tenants/select",
      {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: "tenant-1" }),
      },
    );
  });

  it("selects Cognee's built-in personal scope with a null tenant", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ tenant_id: null }));

    await selectLocalTenant("http://localhost:8000", DEFAULT_LOCAL_SCOPE_ID);

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/permissions/tenants/select",
      {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: null }),
      },
    );
  });
});
