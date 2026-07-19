import type { Tracker, Verdict } from "./types";
import { unwrapProxyUrl } from "./proxy";
import { matchSignature } from "./signatures";
import { hasUniqueToken, isInvisible, type ImgTag } from "./heuristics";

const IMG_TAG = /<img\b[^>]*>/gi;
const ATTR = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*34;/g, '"');
}

/** Pull every <img> tag out of email HTML with its attributes. */
export function extractImgTags(html: string): ImgTag[] {
  const tags: ImgTag[] = [];
  const matches = html.match(IMG_TAG) ?? [];
  for (const tag of matches) {
    const attrs: Record<string, string> = {};
    ATTR.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = ATTR.exec(tag)) !== null) {
      attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    }
    const src = attrs.src || attrs["data-src"] || "";
    if (src) tags.push({ src, attrs });
  }
  return tags;
}

/**
 * The engine's public interface: email body HTML in, verdict out. Pure — no
 * Chrome, no DOM, no Gmail. Confirmed signature matches take precedence; a
 * hidden tokenised pixel with no known signature yields a "suspected" verdict.
 */
export function detect(html: string): Verdict {
  const trackers: Tracker[] = [];
  const seenSignatures = new Set<string>();
  const seenHeuristic = new Set<string>();
  let hasConfirmed = false;

  for (const img of extractImgTags(html)) {
    const url = unwrapProxyUrl(img.src);

    const sig = matchSignature(url);
    if (sig) {
      hasConfirmed = true;
      if (!seenSignatures.has(sig.name)) {
        seenSignatures.add(sig.name);
        trackers.push({
          name: sig.name,
          category: sig.category,
          evidence: {
            imageUrl: url,
            reason: `Matched known ${sig.category} tracker signature "${sig.pattern}"`,
          },
        });
      }
      continue; // a known tracker needn't also be heuristic-flagged
    }

    if (isInvisible(img.attrs) && hasUniqueToken(url) && !seenHeuristic.has(url)) {
      seenHeuristic.add(url);
      trackers.push({
        name: "Unknown tracker",
        category: "unknown",
        evidence: {
          imageUrl: url,
          reason: "Hidden 1×1 image with a unique per-recipient token",
        },
      });
    }
  }

  return {
    tracked: trackers.length > 0,
    confidence: hasConfirmed ? "confirmed" : "suspected",
    trackers,
  };
}
