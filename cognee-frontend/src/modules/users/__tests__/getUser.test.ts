/** @jest-environment node */
import getUser from "../getUser";

const mockIncoming = new Headers();
jest.mock("next/headers", () => ({ headers: async () => mockIncoming }));

const originalUrl = process.env.COGNEE_BACKEND_URL;
beforeEach(() => {
  fetchMock.resetMocks();
  for (const name of [...mockIncoming.keys()]) mockIncoming.delete(name);
  process.env.COGNEE_BACKEND_URL = "https://backend.example.test:8443";
});
afterAll(() => {
  if (originalUrl === undefined) delete process.env.COGNEE_BACKEND_URL;
  else process.env.COGNEE_BACKEND_URL = originalUrl;
});

it("forwards the server caller's credentials when resolving their identity", async () => {
  const credentials = { cookie: "auth=caller", authorization: "Bearer caller", "x-api-key": "caller-key" };
  for (const [name, value] of Object.entries(credentials)) mockIncoming.set(name, value);
  fetchMock.mockResponseOnce(JSON.stringify({ id: "caller", email: "caller@example.test" }));
  await expect(getUser()).resolves.toMatchObject({ id: "caller", email: "caller@example.test" });
  const [url, init] = fetchMock.mock.calls[0];
  expect(url).toBe("https://backend.example.test:8443/api/v1/users/me");
  expect(Object.fromEntries(new Headers(init?.headers))).toEqual(credentials);
});

it("does not invent a server identity when no session exists", async () => {
  fetchMock.mockResponseOnce("unauthorized", { status: 401 });
  await expect(getUser()).resolves.toBeNull();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
