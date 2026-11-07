import getLocalUser from "../getLocalUser";

describe("getLocalUser", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    window.history.replaceState({}, "", "/dashboard");
  });

  it("returns the authenticated backend identity", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({
      id: "337ecf8b-cf41-451d-98ce-9fb8b6fcd842",
      email: "vincent@planasolutions.ai",
      tenant_id: null,
    }));

    await expect(getLocalUser()).resolves.toEqual({
      id: "337ecf8b-cf41-451d-98ce-9fb8b6fcd842",
      name: "vincent",
      email: "vincent@planasolutions.ai",
      picture: "",
    });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/users/me", {
      credentials: "include",
    });
  });

  it("returns null when the backend rejects the session", async () => {
    fetchMock.mockResponseOnce("", { status: 401 });

    await expect(getLocalUser()).resolves.toBeNull();
  });
});
