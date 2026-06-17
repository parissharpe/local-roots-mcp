import { vi, describe, it, expect, beforeEach } from "vitest";
import type { Place } from "../../src/lib/google-places.js";

const mockSearchText = vi.hoisted(() => vi.fn());
const mockCheckWaybackTenure = vi.hoisted(() => vi.fn());

vi.mock("../../src/lib/google-places.js", () => ({
  searchText: mockSearchText,
  getPlaceDetails: vi.fn(),
}));

vi.mock("../../src/lib/wayback.js", () => ({
  checkWaybackTenure: mockCheckWaybackTenure,
  _resetThrottle: vi.fn(),
}));

import { compareLocalVsChain } from "../../src/tools/compareLocalVsChain.js";

const FAKE_INDIE: Place = {
  place_id: "indie_001",
  display_name: "Finca Coffee",
  formatted_address: "123 Indie St, Charlotte, NC 28202, USA",
  types: ["coffee_shop"],
  user_rating_count: 75,
  rating: 4.5,
  photo_count: 6,
  website_uri: "https://fincacoffee.com",
};

const FAKE_CHAIN: Place = {
  place_id: "chain_001",
  display_name: "Starbucks",
  formatted_address: "456 Chain Ave, Charlotte, NC 28202, USA",
  types: ["coffee_shop"],
  user_rating_count: 1500,
  rating: 4.2,
  photo_count: 30,
  website_uri: "https://starbucks.com",
};

beforeEach(() => {
  mockSearchText.mockReset();
  mockCheckWaybackTenure.mockReset();
  mockCheckWaybackTenure.mockResolvedValue(undefined);
});

describe("compareLocalVsChain: both resolved", () => {
  it("scores independent and disqualifies chain, returns positive delta", async () => {
    mockSearchText.mockResolvedValueOnce([FAKE_INDIE]).mockResolvedValueOnce([FAKE_CHAIN]);

    const result = await compareLocalVsChain({
      independent_name: "Finca Coffee",
      chain_name: "Starbucks",
      near: "Charlotte, NC",
    });

    expect(result.answer.independent.name).toBe("Finca Coffee");
    expect(result.answer.chain.name).toBe("Starbucks");
    expect(result.answer.chain.signal_breakdown.disqualified).toBe(true);
    expect(result.answer.score_delta).toBeGreaterThan(0);
    expect(result.answer.verdict).toContain("Finca Coffee");
    expect(result.answer.verdict).toContain("Starbucks");
  });

  it("score_delta equals independent total_score minus chain total_score", async () => {
    mockSearchText.mockResolvedValueOnce([FAKE_INDIE]).mockResolvedValueOnce([FAKE_CHAIN]);

    const result = await compareLocalVsChain({
      independent_name: "Finca Coffee",
      chain_name: "Starbucks",
      near: "Charlotte, NC",
    });

    expect(result.answer.score_delta).toBe(
      result.answer.independent.total_score - result.answer.chain.total_score,
    );
  });
});

describe("compareLocalVsChain: not-found error cases", () => {
  it("throws a clear error when independent cannot be resolved", async () => {
    mockSearchText.mockResolvedValueOnce([]);

    await expect(
      compareLocalVsChain({
        independent_name: "Nonexistent Coffee Shop XYZ",
        chain_name: "Starbucks",
        near: "Charlotte, NC",
      }),
    ).rejects.toThrow("Nonexistent Coffee Shop XYZ");
  });

  it("throws a clear error when chain cannot be resolved", async () => {
    mockSearchText.mockResolvedValueOnce([FAKE_INDIE]).mockResolvedValueOnce([]);

    await expect(
      compareLocalVsChain({
        independent_name: "Finca Coffee",
        chain_name: "Nonexistent Chain Brand ZXCV",
        near: "Charlotte, NC",
      }),
    ).rejects.toThrow("Nonexistent Chain Brand ZXCV");
  });
});

describe("compareLocalVsChain: wayback integration", () => {
  it("includes pre-2005 wayback signal when checkWaybackTenure returns an early year", async () => {
    mockSearchText.mockResolvedValueOnce([FAKE_INDIE]).mockResolvedValueOnce([FAKE_CHAIN]);
    mockCheckWaybackTenure.mockResolvedValueOnce(1999);

    const result = await compareLocalVsChain({
      independent_name: "Finca Coffee",
      chain_name: "Starbucks",
      near: "Charlotte, NC",
    });

    expect(result.answer.independent.wayback_earliest_year).toBe(1999);
    expect(
      result.answer.independent.signal_breakdown.universal.some(
        (s) => s.signal === "tenure_wayback_pre_2005",
      ),
    ).toBe(true);
  });
});
