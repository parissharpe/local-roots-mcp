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

  it("does not match a non-registry farm even when the NC address is present", () => {
    const b = score({
      name: "Riverbend Farm",
      category_hint: "farm",
      user_rating_count: 8,
      formatted_address: "Riverbend Rd, Asheville, NC 28801",
    });
    // Not in sample registry — no nc_century_farm signal
    expect(b.category_bonuses.some((s) => s.signal === "nc_century_farm")).toBe(false);
    // Registry has 15 sample entries, so century_farm_registry_pending does not fire
    expect(b.category_bonuses.some((s) => s.signal === "century_farm_registry_pending")).toBe(false);
  });

  it("fires nc_century_farm for a farm in the bundled sample registry", () => {
    const b = score({
      name: "Plum Granny Farm",
      category_hint: "farm",
      user_rating_count: 5,
      county: "Stokes",
    });
    expect(b.category_bonuses.some((s) => s.signal === "nc_century_farm")).toBe(true);
    expect(b.category_bonuses.find((s) => s.signal === "nc_century_farm")?.points).toBe(30);
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

  it("assigns tier_2 for a modest-footprint independent at the 18-point threshold", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 80,
      photo_count: 5,
      website_uri: "https://cornerdeli.com",
      editorial_summary: undefined,
    });
    // modest_review_count(+8) + sparse_photo_presence(+5) + no_chain_signal(+10) = 23
    expect(b.tier).toBe("tier_2");
    expect(b.total_score).toBeGreaterThanOrEqual(18);
  });
});

describe("score: low_digital_footprint signal", () => {
  it("fires when website, editorial, and photos are all absent", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 15,
      photo_count: 0,
      website_uri: undefined,
      editorial_summary: undefined,
    });
    expect(b.universal.some((s) => s.signal === "low_digital_footprint")).toBe(true);
  });

  it("does not fire when a website is present", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 15,
      photo_count: 0,
      website_uri: "https://cornerdeli.com",
      editorial_summary: undefined,
    });
    expect(b.universal.some((s) => s.signal === "low_digital_footprint")).toBe(false);
  });

  it("does not fire when an editorial summary is present", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 15,
      photo_count: 0,
      website_uri: undefined,
      editorial_summary: "A neighborhood staple since 1988.",
    });
    expect(b.universal.some((s) => s.signal === "low_digital_footprint")).toBe(false);
  });

  it("does not fire when photo count is 3 or more", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 15,
      photo_count: 5,
      website_uri: undefined,
      editorial_summary: undefined,
    });
    expect(b.universal.some((s) => s.signal === "low_digital_footprint")).toBe(false);
  });

  it("fires when photo count is 1 or 2 (under the threshold)", () => {
    const b = score({
      name: "Corner Deli",
      user_rating_count: 15,
      photo_count: 2,
      website_uri: undefined,
      editorial_summary: undefined,
    });
    expect(b.universal.some((s) => s.signal === "low_digital_footprint")).toBe(true);
  });
});

describe("score: no_chain_signal baseline", () => {
  it("fires for non-chain businesses", () => {
    const b = score({ name: "Independent Bookshop", user_rating_count: 50 });
    expect(b.universal.some((s) => s.signal === "no_chain_signal")).toBe(true);
  });

  it("does not fire for disqualified chains (early return path)", () => {
    const b = score({ name: "Walmart", user_rating_count: 2000 });
    expect(b.disqualified).toBe(true);
    expect(b.universal.some((s) => s.signal === "no_chain_signal")).toBe(false);
  });
});

describe("score: photo presence signals", () => {
  it("fires sparse_photo_presence for 1-9 photos", () => {
    const b = score({ name: "Quiet Corner Cafe", user_rating_count: 30, photo_count: 5 });
    expect(b.universal.some((s) => s.signal === "sparse_photo_presence")).toBe(true);
  });

  it("does not fire sparse_photo_presence for 0 photos", () => {
    const b = score({ name: "Quiet Corner Cafe", user_rating_count: 30, photo_count: 0 });
    expect(b.universal.some((s) => s.signal === "sparse_photo_presence")).toBe(false);
  });

  it("does not fire sparse_photo_presence for 10 or more photos", () => {
    const b = score({ name: "Popular Cafe", user_rating_count: 30, photo_count: 10 });
    expect(b.universal.some((s) => s.signal === "sparse_photo_presence")).toBe(false);
  });
});

describe("score: enrichment data flowing into signals", () => {
  it("fires tenure signal when editorial summary provides founding year", () => {
    const b = score({
      name: "Commonwealth Coffee",
      user_rating_count: 12,
      photo_count: 10,
      website_uri: undefined,
      editorial_summary: "Family-owned specialty coffee open since 2002.",
    });
    const hasTenure = b.universal.some(
      (s) => s.signal === "established_10_plus" || s.signal === "established_25_plus",
    );
    expect(hasTenure).toBe(true);
    expect(b.universal.some((s) => s.signal === "family_ownership_in_editorial")).toBe(true);
  });

  it("fires family_ownership_in_editorial when enriched editorial provides that signal", () => {
    const withoutEditorial = score({ name: "Finca Coffee", user_rating_count: 8 });
    const withEditorial = score({
      name: "Finca Coffee",
      user_rating_count: 8,
      editorial_summary: "Family-run specialty roaster.",
    });
    expect(withoutEditorial.universal.some((s) => s.signal === "family_ownership_in_editorial")).toBe(false);
    expect(withEditorial.universal.some((s) => s.signal === "family_ownership_in_editorial")).toBe(true);
    // Both land tier_2 under the v0.2 threshold (low_digital_footprint offsets the editorial gain)
    expect(withoutEditorial.tier).toBe("tier_2");
    expect(withEditorial.tier).toBe("tier_2");
  });
});

describe("score: wayback tenure signals", () => {
  it("fires tenure_wayback_pre_2005 (+20) for a snapshot year before 2005", () => {
    const b = score({ name: "Heritage Books", user_rating_count: 30, wayback_earliest_year: 2001 });
    const sig = b.universal.find((s) => s.signal === "tenure_wayback_pre_2005");
    expect(sig).toBeDefined();
    expect(sig?.points).toBe(20);
  });

  it("fires tenure_wayback_pre_2010 (+12) for a snapshot year between 2005 and 2009", () => {
    const b = score({ name: "Heritage Books", user_rating_count: 30, wayback_earliest_year: 2007 });
    expect(b.universal.some((s) => s.signal === "tenure_wayback_pre_2010")).toBe(true);
    expect(b.universal.some((s) => s.signal === "tenure_wayback_pre_2005")).toBe(false);
  });

  it("fires tenure_wayback_pre_2015 (+6) for a snapshot year between 2010 and 2014", () => {
    const b = score({ name: "Heritage Books", user_rating_count: 30, wayback_earliest_year: 2012 });
    const sig = b.universal.find((s) => s.signal === "tenure_wayback_pre_2015");
    expect(sig).toBeDefined();
    expect(sig?.points).toBe(6);
  });

  it("fires no wayback signal for a snapshot year of 2015 or later", () => {
    const b = score({ name: "Heritage Books", user_rating_count: 30, wayback_earliest_year: 2016 });
    const waybackSigs = b.universal.filter(
      (s) => s.signal.startsWith("tenure_wayback") || s.signal === "wayback_no_snapshot",
    );
    expect(waybackSigs).toHaveLength(0);
  });

  it("fires wayback_no_snapshot (0 points) when wayback_earliest_year is null", () => {
    const b = score({ name: "Heritage Books", user_rating_count: 30, wayback_earliest_year: null });
    const sig = b.universal.find((s) => s.signal === "wayback_no_snapshot");
    expect(sig).toBeDefined();
    expect(sig?.points).toBe(0);
  });
});
