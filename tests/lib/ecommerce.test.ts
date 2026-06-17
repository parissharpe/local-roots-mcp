import { describe, it, expect } from "vitest";
import { detectEcommercePlatforms } from "../../src/lib/ecommerce.js";

describe("detectEcommercePlatforms", () => {
  it("returns no match for null / undefined / blank", () => {
    expect(detectEcommercePlatforms(null).has_online_store).toBe(false);
    expect(detectEcommercePlatforms(undefined).has_online_store).toBe(false);
    expect(detectEcommercePlatforms("").has_online_store).toBe(false);
  });

  it("flags a GrazeCart-hosted farm by subdomain", () => {
    const r = detectEcommercePlatforms("https://sunnyhill.grazecart.com");
    expect(r.has_online_store).toBe(true);
    expect(r.matched_platforms[0].platform_name).toBe("GrazeCart");
  });

  it("flags a barn2door storefront", () => {
    const r = detectEcommercePlatforms("https://oakridge.barn2door.com/shop");
    expect(r.has_online_store).toBe(true);
    expect(r.matched_platforms[0].platform_name).toBe("Barn2Door");
  });

  it("flags localline.ca", () => {
    const r = detectEcommercePlatforms("https://goldenacres.localline.ca");
    expect(r.has_online_store).toBe(true);
  });

  it("flags localharvest.org as medium-strength", () => {
    const r = detectEcommercePlatforms("https://www.localharvest.org/farms/M12345");
    expect(r.has_online_store).toBe(true);
    expect(r.matched_platforms[0].signal_strength).toBe("medium");
  });

  it("does not match a generic farm website", () => {
    expect(detectEcommercePlatforms("https://sunnyhillfarm.com").has_online_store).toBe(false);
    expect(detectEcommercePlatforms("https://oakridge.farm").has_online_store).toBe(false);
  });

  it("handles raw hostnames without scheme", () => {
    const r = detectEcommercePlatforms("sunnyhill.grazecart.com");
    expect(r.has_online_store).toBe(true);
  });
});
