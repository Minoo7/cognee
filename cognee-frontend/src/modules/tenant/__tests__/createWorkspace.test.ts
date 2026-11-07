import createWorkspace from "../createWorkspace";

describe("createWorkspace", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    window.history.replaceState({}, "", "/dashboard");
  });

  it("creates a real Cognee tenant and returns its id", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({
      message: "Tenant created.",
      tenant_id: "tenant-1",
    }));

    await expect(createWorkspace(" Plana Team ")).resolves.toBe("tenant-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/api/v1/permissions/tenants?tenant_name=Plana%20Team",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
      }),
    );
  });
});
