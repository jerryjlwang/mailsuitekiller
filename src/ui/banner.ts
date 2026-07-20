import type { Verdict, Tracker } from "../engine";

// In-message banner shown at the top of an opened tracked email. Identifies the
// tracker by name (when known) and shows the evidence (which image triggered
// the verdict), so the user can judge borderline cases. Three treatments match
// the badge: personal / bulk / suspected.

const STYLE_ID = "msk-banner-styles";
export const BANNER_CLASS = "msk-banner";
/** Marks a message container we've already bannered, to stay idempotent. */
export const BANNERED_ATTR = "data-msk-bannered";

export function ensureBannerStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${BANNER_CLASS}{font:13px/1.5 Roboto,Arial,sans-serif;border-radius:8px;
      padding:10px 12px;margin:8px 0 12px;border-left:4px solid;}
    .${BANNER_CLASS} .msk-head{font-weight:600;margin-bottom:4px;}
    .${BANNER_CLASS} .msk-ev{font-size:11px;opacity:.85;}
    .${BANNER_CLASS} .msk-url{font-family:monospace;word-break:break-all;opacity:.7;margin-bottom:4px;}
    .${BANNER_CLASS}.msk-personal{background:#fce8e6;border-color:#c5221f;color:#5f120f;}
    .${BANNER_CLASS}.msk-bulk{background:#f1f3f4;border-color:#9aa0a6;color:#3c4043;}
    .${BANNER_CLASS}.msk-unknown{background:#fef7e0;border-color:#f9ab00;color:#5f4200;}
    @media (prefers-color-scheme:dark){
      .${BANNER_CLASS}.msk-personal{background:#3c1512;color:#f6aea9;}
      .${BANNER_CLASS}.msk-bulk{background:#2a2c2e;color:#bdc1c6;}
      .${BANNER_CLASS}.msk-unknown{background:#3a2b00;color:#fdd663;}
    }`;
  (document.head ?? document.documentElement).appendChild(style);
}

function primary(verdict: Verdict): Tracker | null {
  return (
    verdict.trackers.find((t) => t.category === "personal") ??
    verdict.trackers.find((t) => t.category === "bulk") ??
    verdict.trackers[0] ??
    null
  );
}

export function renderBanner(verdict: Verdict): HTMLElement | null {
  const t = primary(verdict);
  if (!t) return null;

  const bar = document.createElement("div");
  bar.className = `${BANNER_CLASS} msk-${t.category}`;

  const head = document.createElement("div");
  head.className = "msk-head";
  head.textContent =
    t.category === "personal"
      ? `⚠ This email is tracked by ${t.name}`
      : t.category === "bulk"
        ? `This email includes ${t.name} open-tracking (bulk sender)`
        : "This email looks tracked — a hidden tracking pixel was detected";
  bar.appendChild(head);

  const ev = document.createElement("div");
  ev.className = "msk-ev";
  for (const tr of verdict.trackers) {
    const url = document.createElement("div");
    url.className = "msk-url";
    url.textContent = tr.evidence.imageUrl;
    const reason = document.createElement("div");
    reason.textContent = `${tr.name} — ${tr.evidence.reason}`;
    ev.append(reason, url);
  }
  bar.appendChild(ev);
  return bar;
}
