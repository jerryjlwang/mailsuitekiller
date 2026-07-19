import { describe, it, expect } from "vitest";
import { VerdictCache, type AsyncStorage } from "../src/cache/verdictCache";
import { SIGNATURE_VERSION } from "../src/engine";
import type { Verdict } from "../src/engine";

function memStore(seed: Record<string, unknown> = {}): AsyncStorage {
  const data = new Map<string, unknown>(Object.entries(seed));
  return {
    get: async (keys) => {
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = data.get(k);
      return out;
    },
    set: async (items) => {
      for (const [k, v] of Object.entries(items)) data.set(k, v);
    },
  };
}

const tracked: Verdict = {
  tracked: true,
  confidence: "confirmed",
  trackers: [{ name: "Mailsuite", category: "personal", evidence: { imageUrl: "x", reason: "y" } }],
};
const clean: Verdict = { tracked: false, confidence: "suspected", trackers: [] };

describe("VerdictCache", () => {
  it("round-trips verdicts by message id", async () => {
    const cache = new VerdictCache(memStore());
    await cache.setMany([
      ["19f69ab0cd0015df", tracked],
      ["19f26aa0bb002261", clean],
    ]);
    expect(await cache.get("19f69ab0cd0015df")).toEqual(tracked);
    expect(await cache.get("19f26aa0bb002261")).toEqual(clean);
  });

  it("returns null for an unknown id", async () => {
    const cache = new VerdictCache(memStore());
    expect(await cache.get("deadbeefdeadbeef")).toBeNull();
  });

  it("getMany returns only the hits", async () => {
    const cache = new VerdictCache(memStore());
    await cache.setMany([["19f69ab0cd0015df", tracked]]);
    const got = await cache.getMany(["19f69ab0cd0015df", "missing0000000000"]);
    expect([...got.keys()]).toEqual(["19f69ab0cd0015df"]);
  });

  it("treats entries from a different signature version as a miss", async () => {
    const store = memStore({
      "msk:v:19f69ab0cd0015df": { v: tracked, s: SIGNATURE_VERSION + 1 },
    });
    const cache = new VerdictCache(store);
    expect(await cache.get("19f69ab0cd0015df")).toBeNull();
  });

  it("serves entries written under the current signature version", async () => {
    const store = memStore({
      "msk:v:19f69ab0cd0015df": { v: tracked, s: SIGNATURE_VERSION },
    });
    const cache = new VerdictCache(store);
    expect(await cache.get("19f69ab0cd0015df")).toEqual(tracked);
  });
});
