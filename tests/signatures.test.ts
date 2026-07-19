import { describe, it, expect } from "vitest";
import Ajv from "ajv";
import trackers from "../src/data/trackers.json";

// A malformed signature entry must not be shippable. This schema is the
// contract for the versioned data file in src/data/trackers.json.
const schema = {
  type: "object",
  required: ["version", "signatures"],
  additionalProperties: false,
  properties: {
    version: { type: "integer", minimum: 1 },
    signatures: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        required: ["name", "category", "patterns"],
        additionalProperties: false,
        properties: {
          name: { type: "string", minLength: 1 },
          category: { enum: ["personal", "bulk"] },
          patterns: {
            type: "array",
            minItems: 1,
            items: { type: "string", minLength: 2 },
          },
        },
      },
    },
  },
} as const;

describe("trackers.json signature file", () => {
  it("conforms to the schema", () => {
    const validate = new Ajv().compile(schema);
    const ok = validate(trackers);
    if (!ok) console.error(validate.errors);
    expect(ok).toBe(true);
  });

  it("has unique display names", () => {
    const names = trackers.signatures.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has no empty or whitespace-only patterns", () => {
    for (const sig of trackers.signatures) {
      for (const p of sig.patterns) {
        expect(p.trim()).toBe(p);
        expect(p.length).toBeGreaterThan(1);
      }
    }
  });
});
