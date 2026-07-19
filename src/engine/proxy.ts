// Gmail routes every external image through its caching proxy on
// googleusercontent.com, rewriting the URL. Tracker signatures are written
// against original tracker domains, so we must recover the original URL before
// matching. Two proxy forms are handled:
//
//   1. Fragment form (most common):
//      https://ci3.googleusercontent.com/proxy/<hash>=s0-d-e1-ft#https://tracker.com/pixel.png
//      -> the original URL is everything after the '#'.
//   2. Query form (legacy inline-image / generic proxy):
//      https://…/proxy?…&url=https%3A%2F%2Ftracker.com%2Fpixel.png
//      -> the original is the percent-encoded `url` param.

const PROXY_HOST = /googleusercontent\.com/i;

export function isGoogleProxy(url: string): boolean {
  return PROXY_HOST.test(url);
}

/** Recover the original image URL from a Gmail-proxied one, if possible. */
export function unwrapProxyUrl(url: string): string {
  if (!isGoogleProxy(url)) return url;

  // Fragment form: original URL sits after the first '#'.
  const hashIdx = url.indexOf("#");
  if (hashIdx !== -1) {
    const frag = url.slice(hashIdx + 1);
    if (/^https?:\/\//i.test(frag)) return safeDecode(frag);
  }

  // Query form: a `url=` param carrying the encoded original.
  const m = url.match(/[?&]url=([^&]+)/i);
  if (m) {
    const decoded = safeDecode(m[1]);
    if (/^https?:\/\//i.test(decoded)) return decoded;
  }

  return url;
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
