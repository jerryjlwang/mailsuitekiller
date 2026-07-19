import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { detect } from "../src/engine";

const fx = (name: string) =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), "utf8");

describe("confirmed signature detection", () => {
  it("flags Mailsuite (personal) and recovers the original URL from the proxy", () => {
    const v = detect(fx("mailsuite.html"));
    expect(v.tracked).toBe(true);
    expect(v.confidence).toBe("confirmed");
    expect(v.trackers).toHaveLength(1);
    expect(v.trackers[0].name).toBe("Mailsuite");
    expect(v.trackers[0].category).toBe("personal");
    expect(v.trackers[0].evidence.imageUrl).toContain("mailtrack.io");
    expect(v.trackers[0].evidence.imageUrl).not.toContain("googleusercontent");
  });

  it("flags Yesware (personal)", () => {
    const v = detect(fx("yesware.html"));
    expect(v.tracked).toBe(true);
    expect(v.confidence).toBe("confirmed");
    expect(v.trackers[0].name).toBe("Yesware");
    expect(v.trackers[0].category).toBe("personal");
    expect(v.trackers[0].evidence.imageUrl).toContain("t.yesware.com");
  });

  it("flags Streak (personal) via its appspot pixel", () => {
    const v = detect(fx("streak.html"));
    expect(v.tracked).toBe(true);
    expect(v.trackers[0].name).toBe("Streak");
    expect(v.trackers[0].evidence.imageUrl).toContain("mailfoogae.appspot.com");
  });

  it("flags HubSpot and decodes HTML entities in the recovered URL", () => {
    const v = detect(fx("hubspot.html"));
    expect(v.tracked).toBe(true);
    expect(v.trackers[0].name).toBe("HubSpot");
    expect(v.trackers[0].evidence.imageUrl).toContain("track.hubspot.com");
    expect(v.trackers[0].evidence.imageUrl).toContain("a=1234567");
    expect(v.trackers[0].evidence.imageUrl).not.toContain("&amp;");
  });

  it("flags Mailchimp as bulk, not personal", () => {
    const v = detect(fx("mailchimp.html"));
    expect(v.tracked).toBe(true);
    expect(v.confidence).toBe("confirmed");
    expect(v.trackers[0].name).toBe("Mailchimp");
    expect(v.trackers[0].category).toBe("bulk");
  });

  it("flags SendGrid as bulk", () => {
    const v = detect(fx("sendgrid.html"));
    expect(v.tracked).toBe(true);
    expect(v.trackers[0].name).toBe("SendGrid");
    expect(v.trackers[0].category).toBe("bulk");
  });
});

describe("heuristic detection of unknown trackers", () => {
  it("flags a hidden 1x1 pixel with a unique token as suspected/unknown", () => {
    const v = detect(fx("heuristic-unknown.html"));
    expect(v.tracked).toBe(true);
    expect(v.confidence).toBe("suspected");
    expect(v.trackers).toHaveLength(1);
    expect(v.trackers[0].name).toBe("Unknown tracker");
    expect(v.trackers[0].category).toBe("unknown");
    expect(v.trackers[0].evidence.reason).toMatch(/hidden/i);
    expect(v.trackers[0].evidence.imageUrl).toContain("acme-crm.example");
  });
});

describe("false-positive traps", () => {
  it("does not flag tiny spacer gifs (no unique token)", () => {
    const v = detect(fx("fp-spacer.html"));
    expect(v.tracked).toBe(false);
    expect(v.trackers).toEqual([]);
  });

  it("does not flag visible logos / hero images with hashed names", () => {
    const v = detect(fx("fp-logo.html"));
    expect(v.tracked).toBe(false);
    expect(v.trackers).toEqual([]);
  });

  it("does not flag a clean text email with no images", () => {
    const v = detect(fx("fp-clean.html"));
    expect(v.tracked).toBe(false);
    expect(v.trackers).toEqual([]);
  });
});

describe("verdict shape", () => {
  it("always returns the full verdict contract", () => {
    const v = detect(fx("mailsuite.html"));
    expect(v).toHaveProperty("tracked");
    expect(v).toHaveProperty("confidence");
    expect(Array.isArray(v.trackers)).toBe(true);
    for (const t of v.trackers) {
      expect(t).toMatchObject({
        name: expect.any(String),
        category: expect.stringMatching(/^(personal|bulk|unknown)$/),
        evidence: { imageUrl: expect.any(String), reason: expect.any(String) },
      });
    }
  });

  it("handles empty input without throwing", () => {
    expect(detect("")).toEqual({ tracked: false, confidence: "suspected", trackers: [] });
  });
});
