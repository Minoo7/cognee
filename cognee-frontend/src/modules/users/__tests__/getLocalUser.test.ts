import getLocalUser from "../getLocalUser";

beforeEach(() => fetchMock.resetMocks());
it("uses the authenticated identity rather than a local placeholder", async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ id: "user-42", email: "member@example.test" }));
  await expect(getLocalUser("https://backend.example.test")).resolves.toEqual({
    id: "user-42", name: "member", email: "member@example.test", picture: "",
  });
  expect(fetchMock.mock.calls[0]).toEqual([
    "https://backend.example.test/api/v1/users/me",
    { credentials: "include", headers: undefined, cache: "no-store" },
  ]);
});
it("returns no identity for an unauthenticated caller", async () => {
  fetchMock.mockResponseOnce("unauthorized", { status: 401 });
  await expect(getLocalUser()).resolves.toBeNull();
});
it("rejects malformed successful identity responses", async () => {
  fetchMock.mockResponseOnce(JSON.stringify({ id: "user-42" }));
  await expect(getLocalUser()).rejects.toThrow();
});
