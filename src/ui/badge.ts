import type { Verdict, Tracker } from "../engine";

// Inbox-row badge rendering. Three visual treatments matching the PRD:
// personal tracker (loud), bulk/ESP open-tracking (quiet), and heuristic-only
// "suspected" (amber). Vanilla DOM + one injected stylesheet — no framework
// weight inside Gmail's DOM.

const STYLE_ID = "msk-badge-styles";
export const BADGE_CLASS = "msk-badge";
/** Marks a row container we've already badged, so passes stay idempotent. */
export const BADGED_ATTR = "data-msk-badged";

export function ensureBadgeStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .${BADGE_CLASS}{display:inline-block;font:600 11px/14px Roboto,Arial,sans-serif;
      padding:1px 6px;border-radius:8px;margin-right:6px;vertical-align:middle;white-space:nowrap;}
    .${BADGE_CLASS}.msk-personal{background:#fce8e6;color:#c5221f;}
    .${BADGE_CLASS}.msk-bulk{background:#e8eaed;color:#5f6368;}
    .${BADGE_CLASS}.msk-unknown{background:#fef7e0;color:#b06000;}
    @media (prefers-color-scheme:dark){
      .${BADGE_CLASS}.msk-personal{background:#5c1d1b;color:#f6aea9;}
      .${BADGE_CLASS}.msk-bulk{background:#3c4043;color:#bdc1c6;}
      .${BADGE_CLASS}.msk-unknown{background:#4d3800;color:#fdd663;}
    }`;
  (document.head ?? document.documentElement).appendChild(style);
}

/** The tracker that drives the badge: personal > bulk > heuristic. */
function primary(verdict: Verdict): Tracker | null {
  return (
    verdict.trackers.find((t) => t.category === "personal") ??
    verdict.trackers.find((t) => t.category === "bulk") ??
    verdict.trackers[0] ??
    null
  );
}

export function renderBadge(verdict: Verdict): HTMLElement | null {
  const t = primary(verdict);
  if (!t) return null;
  const span = document.createElement("span");
  span.className = `${BADGE_CLASS} msk-${t.category}`;
  span.textContent =
    t.category === "personal"
      ? t.name
      : t.category === "bulk"
        ? `${t.name} · bulk`
        : "likely tracked";
  span.title = verdict.trackers
    .map((x) => `${x.name} (${x.category}) — ${x.evidence.reason}\n${x.evidence.imageUrl}`)
    .join("\n\n");
  return span;
}
