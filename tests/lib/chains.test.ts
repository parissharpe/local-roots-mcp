import { describe, it, expect } from "vitest";
import { detectChain, normalize } from "../../src/lib/chains.js";

describe("normalize", () => {
  it("lowercases and strips punctuation", () => {
    expect(normalize("McDonald's")).toBe("mcdonalds");
    expect(normalize("Trader Joe's")).toBe("trader joes");
    expect(normalize("  Five  Guys  ")).toBe("five guys");
  });
});

describe("detectChain", () => {
  it("flags national chains by exact name", () => {
    expect(detectChain("Starbucks").matched).toBe(true);
    expect(detectChain("McDonald's").matched).toBe(true);
    expect(detectChain("Whole Foods Market").matched).toBe(true);
  });

  it("matches aliases", () => {
    expect(detectChain("KFC").matched).toBe(true);
    expect(detectChain("Kentucky Fried Chicken").matched).toBe(true);
    expect(detectChain("Dunkin").matched).toBe(true);
  });

  it("does not match independents that share a word with a chain", () => {
    expect(detectChain("Joe's Burger Shack").matched).toBe(false);
    expect(detectChain("Sunny Hill Farm").matched).toBe(false);
    expect(detectChain("Maria's Coffee Roastery").matched).toBe(false);
  });

  it("matches when the chain name is embedded in a longer location string", () => {
    expect(detectChain("Starbucks Reserve Roastery").matched).toBe(true);
  });

  it("handles empty / blank input", () => {
    expect(detectChain("").matched).toBe(false);
    expect(detectChain("   ").matched).toBe(false);
  });
});
