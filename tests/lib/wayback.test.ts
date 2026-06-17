import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkWaybackTenure, _resetThrottle } from "../../src/lib/wayback.js";

const mockFetch = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", mockFetch);

describe("checkWaybackTenure", () => {
  beforeEach(() => {
    _resetThrottle();
    mockFetch.mockReset();
  });

  it("returns the earliest snapshot year when CDX response has data rows", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [["timestamp"], ["20011015123456"]],
    } as unknown as Response);
    const year = await checkWaybackTenure("https://example.com");
    expect(year).toBe(2001);
  });

  it("returns null when CDX returns header-only response (no snapshots exist)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [["timestamp"]],
    } as unknown as Response);
    const year = await checkWaybackTenure("https://example.com");
    expect(year).toBeNull();
  });

  it("returns undefined without calling fetch when input is null", async () => {
    const year = await checkWaybackTenure(null);
    expect(year).toBeUndefined();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns undefined when fetch throws a network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network error"));
    const year = await checkWaybackTenure("https://example.com");
    expect(year).toBeUndefined();
  });

  it("returns undefined when CDX returns a non-ok HTTP status", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    } as unknown as Response);
    const year = await checkWaybackTenure("https://example.com");
    expect(year).toBeUndefined();
  });
});
