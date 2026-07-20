// Gmail exposes a message id in several encodings: bare 16-hex (inbox rows'
// data-legacy-*-message-id), or msg-f:<decimal> / thread-f:<decimal> where the
// decimal is the base-10 of that same hex. Verdicts are keyed by hex, so
// normalise any form to lowercase hex for the join.
export function normalizeToHex(raw: string): string | null {
  let s = raw.trim().replace(/^#/, "");
  const m = s.match(/(?:msg|thread)-[a-z]:(\d+)/i);
  if (m) {
    try {
      s = BigInt(m[1]).toString(16);
    } catch {
      return null;
    }
  }
  return /^[0-9a-f]{6,}$/i.test(s) ? s.toLowerCase() : null;
}
