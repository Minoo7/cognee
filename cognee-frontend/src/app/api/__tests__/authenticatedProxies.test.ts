/** @jest-environment node */
import { NextRequest } from "next/server";
import { GET as visualize } from "../visualize/route";
import { GET as inventory } from "../schema/inventory/route";
import { GET as provenance } from "../schema/provenance/route";
import { GET as provenanceAlias } from "../schema-provenance/route";

// jest-fetch-mock installs node-fetch v2, which predates static Response.json.
Object.defineProperty(Response, "json", {
  configurable: true,
  value: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), {
    ...init, headers: { "content-type": "application/json" },
  }),
});

const routes = [visualize, inventory, provenance, provenanceAlias];
const originalUrl = process.env.COGNEE_BACKEND_URL;
afterAll(() => {
  if (originalUrl === undefined) delete process.env.COGNEE_BACKEND_URL;
  else process.env.COGNEE_BACKEND_URL = originalUrl;
});
beforeEach(() => {
  fetchMock.resetMocks();
  process.env.COGNEE_BACKEND_URL = "https://backend.example.test:8443";
});

it.each(routes)("forwards only caller credentials and resolves the runtime URL", async (route) => {
  fetchMock.mockResponseOnce(JSON.stringify([]));
  const headers = { cookie: "auth=caller", authorization: "Bearer caller", "x-api-key": "caller-key" };
  const response = await route(new NextRequest("https://ui.example.test/api/view?dataset_id=brain", { headers }));
  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, options] = fetchMock.mock.calls[0];
  expect(url).toMatch(/^https:\/\/backend\.example\.test:8443\/api\/v1\//);
  expect(options?.headers).toEqual(headers);
});

it.each(routes)("preserves unauthenticated denial without logging in as a default user", async (route) => {
  fetchMock.mockResponseOnce("unauthorized", { status: 401 });
  const response = await route(new NextRequest("https://ui.example.test/api/view?dataset_id=brain"));
  expect(response.status).toBe(401);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).not.toContain("auth/login");
  expect(fetchMock.mock.calls[0][1]?.headers).toEqual({});
});
