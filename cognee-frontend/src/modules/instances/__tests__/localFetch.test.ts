import fetchMock from "jest-fetch-mock";
import localFetch from "../localFetch";
import { HttpError } from "@/services/http/errors";
import { RUNTIME_CONFIG_ELEMENT_ID } from "@/modules/config/runtimeConfig";

describe("localFetch errors", () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    jest.spyOn(console, "log").mockImplementation(() => {});
    jest.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    jest.restoreAllMocks();
    document.getElementById(RUNTIME_CONFIG_ELEMENT_ID)?.remove();
  });

  it("preserves cancellation without reporting a network failure", async () => {
    const error = new DOMException("Aborted", "AbortError");
    fetchMock.mockRejectOnce(error);
    await expect(localFetch("/v1/datasets")).rejects.toBe(error);
    expect(console.error).not.toHaveBeenCalled();
  });

  it.each([401, 403])("preserves native recording read denial %i without redirect", async (status) => {
    const config = document.createElement("script");
    config.id = RUNTIME_CONFIG_ELEMENT_ID;
    config.type = "application/json";
    config.textContent = JSON.stringify({ backendUrl: "http://runtime-backend:8123" });
    document.head.appendChild(config);
    fetchMock.mockResponseOnce(JSON.stringify({ detail: "denied" }), { status });
    await expect(localFetch("/v1/activity/pipeline-runs?limit=50")).rejects.toMatchObject({ status });
    expect(fetchMock).toHaveBeenLastCalledWith("http://runtime-backend:8123/api/v1/activity/pipeline-runs?limit=50", expect.objectContaining({ credentials: "include" }));
    fetchMock.mockResponseOnce(JSON.stringify({ detail: "denied" }), { status });
    await expect(localFetch("/v1/sessions/A")).rejects.toMatchObject({ status });
  });

  it("still reports a real connection failure", async () => {
    fetchMock.mockRejectOnce(new TypeError("Failed to fetch"));
    await expect(localFetch("/v1/datasets")).rejects.toThrow("No connection to the server.");
    expect(console.error).toHaveBeenCalled();
  });

  it("preserves the server's error message", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ detail: "Service unavailable" }), { status: 503 });
    await expect(localFetch("/v1/datasets")).rejects.toThrow("Service unavailable");
    expect(console.error).not.toHaveBeenCalled();
  });

  it("preserves HTTP status for the live-events cursor recovery", async () => {
    fetchMock.mockResponseOnce(JSON.stringify({ error: "Failed to fetch live events" }), { status: 409 });
    const error = await localFetch("/v1/visualize/live-events?since=stale").catch((error) => error);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(409);
    expect(console.error).not.toHaveBeenCalled();
  });
});
