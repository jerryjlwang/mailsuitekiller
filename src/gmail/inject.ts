// MAIN-world interceptor (spike-only).
//
// Hooks the page's own fetch / XHR to observe which of Gmail's network
// responses carry message *body* HTML (i.e. contain <img> tags), and when.
// It reports every mail.google.com response along with its <img> count and
// endpoint so the collector can distinguish real body payloads from large
// imageless metadata blobs. It only reads responses; it never issues a request
// of its own and never mutates Gmail traffic.
(() => {
  const TAG = "[MSK-spike/inject]";
  const t0 = performance.now();

  // Gmail returns body HTML escaped inside RPC/JSON payloads, so count <img in
  // raw, unicode-escaped, and HTML-entity forms.
  function imgCount(body: string): number {
    const raw = body.match(/<img\b/gi)?.length ?? 0;
    const uni = body.match(/\\u003cimg/gi)?.length ?? 0;
    const ent = body.match(/&lt;img/gi)?.length ?? 0;
    return raw + uni + ent;
  }

  function report(url: string, body: string): void {
    const imgs = imgCount(body);
    // Report anything image-bearing, plus the /sync data endpoints regardless
    // (so we can see imageless data payloads too), plus other largeish blobs.
    const isSyncData = /\/sync\/u\/\d+\/i\/[a-z]+\b/.test(url);
    if (imgs === 0 && !isSyncData && body.length < 8000) return;
    window.postMessage(
      {
        source: "MSK_SPIKE",
        url,
        bytes: body.length,
        imgs,
        t: Math.round(performance.now() - t0),
      },
      "*",
    );
  }

  const isGmail = (url: string) => /mail\.google\.com/.test(url);

  // --- fetch ---
  const origFetch = window.fetch;
  window.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
    const input = args[0];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url;
    const promise = origFetch.apply(this as never, args);
    if (isGmail(url)) {
      promise
        .then((res) => {
          res
            .clone()
            .text()
            .then((txt) => report(url, txt))
            .catch(() => {});
        })
        .catch(() => {});
    }
    return promise;
  };

  // --- XMLHttpRequest ---
  const xhrProto = XMLHttpRequest.prototype;
  const origOpen = xhrProto.open;
  const origSend = xhrProto.send;
  xhrProto.open = function (this: XMLHttpRequest, ...args: unknown[]) {
    (this as unknown as { __mskUrl?: string }).__mskUrl = String(args[1] ?? "");
    return origOpen.apply(this, args as never);
  };
  xhrProto.send = function (this: XMLHttpRequest, ...args: unknown[]) {
    const url = (this as unknown as { __mskUrl?: string }).__mskUrl;
    if (url && isGmail(url)) {
      this.addEventListener("load", function (this: XMLHttpRequest) {
        try {
          const txt = this.responseText;
          if (txt) report(url, txt);
        } catch {
          /* non-text response */
        }
      });
    }
    return origSend.apply(this, args as never);
  };

  console.log(TAG, "interceptor installed at document_start");
})();
