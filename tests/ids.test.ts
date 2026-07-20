import { describe, it, expect } from "vitest";
import { normalizeToHex } from "../src/gmail/ids";

describe("normalizeToHex", () => {
  it("passes through bare 16-hex ids, lowercased", () => {
    expect(normalizeToHex("19F69AB0CD0015DF")).toBe("19f69ab0cd0015df");
  });

  it("strips a leading #", () => {
    expect(normalizeToHex("#19f69ab0cd0015df")).toBe("19f69ab0cd0015df");
  });

  it("converts msg-f:<decimal> to the same hex (round-trip)", () => {
    const hex = "19f69ab0cd0015df";
    const decimal = BigInt("0x" + hex).toString(10);
    expect(normalizeToHex(`msg-f:${decimal}`)).toBe(hex);
  });

  it("converts thread-f:<decimal> and tolerates a # prefix", () => {
    const hex = "19f26aa0bb002261";
    const decimal = BigInt("0x" + hex).toString(10);
    expect(normalizeToHex(`#thread-f:${decimal}`)).toBe(hex);
  });

  it("returns null for non-id strings", () => {
    expect(normalizeToHex("")).toBeNull();
    expect(normalizeToHex("not-an-id")).toBeNull();
    expect(normalizeToHex("msg-f:notanumber")).toBeNull();
  });
});
