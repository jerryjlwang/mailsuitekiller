import { isGoogleProxy } from "./proxy";

// Heuristic detection of unknown / self-hosted trackers: an image that is
// invisible (1×1 or hidden) AND whose URL carries a long unique per-recipient
// token. Both conditions are required — a hidden spacer.gif (no token) is not a
// tracker, and a visible image with a hashed filename (a logo) is not either.

export interface ImgTag {
  /** Raw src as it appeared (before proxy unwrapping). */
  src: string;
  attrs: Record<string, string>;
}

const HIDDEN_STYLE =
  /(?:^|;)\s*(?:display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\.0+)?)\s*(?:;|$)/i;
const TINY_STYLE_DIM =
  /(?:width|height)\s*:\s*(?:0|1)(?:px|\s|;|$)/i;

/** 1×1, zero-sized, or CSS-hidden. */
export function isInvisible(attrs: Record<string, string>): boolean {
  const w = attrs.width?.trim();
  const h = attrs.height?.trim();
  if ((w === "0" || w === "1") && (h === "0" || h === "1")) return true;
  if (w === "0" || h === "0") return true;

  const style = attrs.style ?? "";
  if (HIDDEN_STYLE.test(style)) return true;
  // Two tiny CSS dimensions (width:1px;height:1px).
  const tinyMatches = style.match(new RegExp(TINY_STYLE_DIM, "gi"));
  if (tinyMatches && tinyMatches.length >= 2) return true;

  return false;
}

/**
 * True if the (unwrapped) URL carries a high-entropy token that looks like a
 * per-recipient identifier: a 16+ char hex string, or a 20+ char mixed
 * alphanumeric segment. Returns false for still-proxied URLs (the proxy hash
 * isn't discriminating — every proxied image has one).
 */
export function hasUniqueToken(url: string): boolean {
  if (isGoogleProxy(url)) return false;

  let path = url;
  let query = "";
  const qIdx = url.indexOf("?");
  if (qIdx !== -1) {
    path = url.slice(0, qIdx);
    query = url.slice(qIdx + 1);
  }

  const candidates: string[] = [];
  for (const seg of path.split("/")) candidates.push(seg.replace(/\.[a-z0-9]+$/i, ""));
  for (const pair of query.split("&")) {
    const eq = pair.indexOf("=");
    candidates.push(eq === -1 ? pair : pair.slice(eq + 1));
  }

  return candidates.some(looksLikeToken);
}

function looksLikeToken(s: string): boolean {
  if (/^[0-9a-f]{16,}$/i.test(s)) return true; // hex id
  if (s.length >= 20 && /^[A-Za-z0-9_=-]+$/.test(s) && /[0-9]/.test(s) && /[A-Za-z]/.test(s)) {
    return true; // long mixed base64-ish token
  }
  return false;
}
