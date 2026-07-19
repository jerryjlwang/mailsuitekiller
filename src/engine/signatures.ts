import type { Category } from "./types";
import trackerData from "../data/trackers.json";

export interface Signature {
  name: string;
  category: Exclude<Category, "unknown">;
  /** Case-insensitive substrings; a URL matches if it contains any of them. */
  patterns: string[];
}

interface SignatureFile {
  version: number;
  signatures: Signature[];
}

const data = trackerData as SignatureFile;

/** Version of the loaded signature list; verdict cache entries key off this. */
export const SIGNATURE_VERSION = data.version;

export interface SignatureMatch {
  name: string;
  category: Exclude<Category, "unknown">;
  /** The specific pattern that matched, surfaced as evidence. */
  pattern: string;
}

/**
 * Return the first signature matching `url`, or null. `url` should already be
 * proxy-unwrapped. Matching is a case-insensitive substring test against the
 * full URL, which naturally covers host- and path-based signatures.
 */
export function matchSignature(url: string): SignatureMatch | null {
  const haystack = url.toLowerCase();
  for (const sig of data.signatures) {
    for (const pattern of sig.patterns) {
      if (haystack.includes(pattern.toLowerCase())) {
        return { name: sig.name, category: sig.category, pattern };
      }
    }
  }
  return null;
}
