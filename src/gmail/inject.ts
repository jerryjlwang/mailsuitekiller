// MAIN-world prefetch capture.
//
// Runs in the page context at document_start so it can hook the real fetch/XHR
// before Gmail uses them, and observes Gmail's /sync/.../i/fd prefetch feed
// (which carries message body HTML before the user opens anything — see
// docs/SPIKE.md). It posts the raw feed to the ISOLATED collector, which does
// the parsing/detection. Kept deliberately IMPORT-FREE: CRXJS then inlines it
// as a plain classic script (no module loader), which is the only reliable way
// to run in the MAIN world. It issues no request of its own.
(() => {
  const isFeed = (url: string) => /mail\.google\.com\/sync\/u\/\d+\/i\/fd\b/.test(url);
  const post = (raw: string) => {
    if (raw) window.postMessage({ source: "MSK", kind: "feed", raw }, "*");
  };

  const origFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const input = args[0];
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
    const p = origFetch.apply(this as never, args);
    if (isFeed(url)) {
      p.then((res) => res.clone().text().then(post).catch(() => {})).catch(() => {});
    }
    return p;
  };

  const xhrProto = XMLHttpRequest.prototype;
  const origOpen = xhrProto.open;
  const origSend = xhrProto.send;
  xhrProto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    (this as unknown as { __u?: string }).__u = String(args[1] ?? "");
    return origOpen.apply(this, args as never);
  };
  xhrProto.send = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = (this as unknown as { __u?: string }).__u;
    if (url && isFeed(url)) {
      this.addEventListener("load", function (this: XMLHttpRequest) {
        try {
          if (this.responseText) post(this.responseText);
        } catch {
          /* non-text response */
        }
      });
    }
    return origSend.apply(this, args as never);
  };

  console.log("[MSK] prefetch capture installed");
})();
