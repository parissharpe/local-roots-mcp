import { describe, it, expect } from "vitest";
import { score } from "../../src/lib/scoring.js";

describe("score: chain disqualification", () => {
  it("flags a chain as tier_4 and disqualified", () => {
    const b = score({ name: "Starbucks", user_rating_count: 800 });
    expect(b.disqualified).toBe(true);
    expect(b.tier).toBe("tier_4");
    expect(b.disqualification_reason).toContain("Starbucks");
  });

  it("does not disqualify an independent that shares a word with a chain", () => {
    const b = score({ name: "Joe's Burger Shack", user_rating_count: 40 });
    expect(b.disqualified).toBe(false);
    expect(b.tier).not.toBe("tier_4");
  });
});

describe("score: tenure signals", () => {
  it("rewards 100+ year tenure heavily", () => {
    const b = score({
      name: "Smith Family Hardware",
      editorial_summary: "Established 1899 in downtown Smithville.",
      user_rating_count: 30,
    });
    const tenure = b.universal.find((s) => s.signal === "century_plus_in_text");
    expect(tenure).toBeDefined();
    expect(tenure?.points).toBeGreaterThanOrEqual(35);
  });

  it("recognizes 'Since 1975' phrasing", () => {
    const b = score({
      name: "Acme Diner",
      editorial_summary: "Since 1975, the diner of choice.",
      user_rating_count: 70,
    });
    const tenure = b.universal.find((s) => s.signal === "half_century_in_text");
    expect(tenure).toBeDefined();
  });
});

describe("score: family ownership", () => {
  it("flags '& Sons' in the name", () => {
    const b = score({ name: "Patel & Sons Grocery", user_rating_count: 25 });
    expect(b.universal.some((s) => s.signal === "family_ownership_in_name")).toBe(true);
  });

  it("flags possessive-S + business type in the name", () => {
    const b = score({ name: "Maria's Bakery", user_rating_count: 25 });
    expect(b.universal.some((s) => s.signal === "family_ownership_in_name")).toBe(true);
  });
});

describe("score: marketing footprint", () => {
  it("rewards low review count", () => {
    const b = score({ name: "Quiet Corner Cafe", user_rating_count: 20 });
    expect(b.universal.some((s) => s.signal === "low_review_count")).toBe(true);
  });

  it("penalizes algorithmic-winner review counts", () => {
    const b = score({ name: "Hipster Independent Cafe", user_rating_count: 3200 });
    expect(b.negatives.some((s) => s.signal === "algorithmic_winner")).toBe(true);
  });
});

describe("score: category bonuses for farms", () => {
  it("rewards a DTC e-commerce platform", () => {
    const b = score({
      name: "Oakridge Farm",
      category_hint: "farm",
      website_uri: "https://oakridge.barn2door.com",
      user_rating_count: 12,
    });
    expect(b.category_bonuses.some((s) => s.signal.startsWith("ecommerce_platform:"))).toBe(true);
  });

  it("does not add a phantom Century Farm signal when the registry is empty", () => {
    const b = score({
      name: "Riverbend Farm",
      category_hint: "farm",
      user_rating_count: 8,
      formatted_address: "Riverbend Rd, Asheville, NC 28801",
    });
    const phantom = b.category_bonuses.find((s) => s.signal === "nc_century_farm");
    expect(phantom).toBeUndefined();
    const pending = b.category_bonuses.find((s) => s.signal === "century_farm_registry_pending");
    expect(pending).toBeDefined();
    expect(pending?.points).toBe(0);
  });
});

describe("score: tier assignment", () => {
  it("assigns tier_1 for a strong independent", () => {
    const b = score({
      name: "Wilson & Sons Hardware",
      editorial_summary: "Established 1932 by the Wilson family.",
      user_rating_count: 18,
      photo_count: 4,
      website_uri: null,
    });
    expect(b.tier).toBe("tier_1");
  });

  it("assigns at least tier_3 for a baseline independent", () => {
    const b = score({ name: "Some Local Spot", user_rating_count: 0 });
    expect(["tier_1", "tier_2", "tier_3"]).toContain(b.tier);
  });
});
