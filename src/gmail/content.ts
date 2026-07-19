// ISOLATED-world collector (spike-only).
//
// Correlates the MAIN-world interceptor's reports with open state (URL hash)
// and prints an UNAMBIGUOUS verdict: were message bodies WITH images (real
// email HTML, imgs>0) seen BEFORE any message was opened? Large imageless
// metadata blobs are tracked separately so they can't inflate the count.

const TAG = "[MSK-spike]";
const startedAt = performance.now();

// Gmail list views have a short hash (#inbox, #search/foo). Opening a thread
// appends a long id token (#inbox/FMfcgz…, #search/query/FMfcgz…). The trailing
// token is base64-ish [A-Za-z0-9_-]{12,}; search *list* views end in the query
// (contains %/@/.) and correctly don't match.
function isMessageOpen(): boolean {
  const parts = location.hash.replace(/^#/, "").split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return parts.length >= 2 && /^[A-Za-z0-9_-]{12,}$/.test(last);
}

let firstOpenAt: number | null = null;
// image-bearing body payloads (the ones that matter)
let bodyBefore = 0;
let bodyAfter = 0;
let maxImgsBefore = 0;
const bodyEndpointsBefore = new Set<string>();
// imageless data blobs (metadata / thread lists) — tracked, not counted as body
let blobBefore = 0;
let blobAfter = 0;

function endpointOf(url: string): string {
  return url.match(/\/(i\/[a-z]+)\b/)?.[1] ?? url.split("?")[0].slice(-24);
}

function checkOpen(): void {
  if (firstOpenAt === null && isMessageOpen()) {
    firstOpenAt = Math.round(performance.now() - startedAt);
    console.log(
      `${TAG} first message-open detected at ~${firstOpenAt}ms (hash=${location.hash})`,
    );
  }
}
window.addEventListener("hashchange", checkOpen);
checkOpen();

interface SpikeReport {
  source: "MSK_SPIKE";
  url: string;
  bytes: number;
  imgs: number;
  t: number;
}

window.addEventListener("message", (e: MessageEvent) => {
  const d = e.data as Partial<SpikeReport> | null;
  if (!d || d.source !== "MSK_SPIKE") return;
  const before = firstOpenAt === null;
  const ep = endpointOf(String(d.url));
  const imgs = d.imgs ?? 0;

  if (imgs > 0) {
    if (before) {
      bodyBefore++;
      maxImgsBefore = Math.max(maxImgsBefore, imgs);
      bodyEndpointsBefore.add(ep);
    } else {
      bodyAfter++;
    }
    console.log(
      `${TAG} IMG-BEARING BODY imgs=${imgs} bytes=${d.bytes} endpoint=${ep} t=${d.t}ms ` +
        `${before ? "BEFORE any open ✅" : "after open ⏱"}`,
    );
  } else {
    before ? blobBefore++ : blobAfter++;
  }
});

setInterval(() => {
  if (bodyBefore + bodyAfter + blobBefore + blobAfter === 0) return;
  const verdict = bodyBefore > 0 ? "BODY PREFETCH CONFIRMED ✅" : "bodies only on open ❌";
  console.log(
    `${TAG} VERDICT — bodies-with-images BEFORE open: ${bodyBefore} ` +
      `(max imgs=${maxImgsBefore}, endpoints=[${[...bodyEndpointsBefore].join(",")}]); ` +
      `after open: ${bodyAfter}. imageless data blobs before/after: ${blobBefore}/${blobAfter}. ` +
      `=> ${verdict}`,
  );
}, 5000);

console.log(
  `${TAG} collector ready. Sit on the inbox a few seconds (scroll a little), then open a tracked email. Read the VERDICT line.`,
);
