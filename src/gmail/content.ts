// ISOLATED-world collector + badger.
//
// Receives compact verdicts from the MAIN-world capture, persists them in the
// verdict cache (so re-renders and reloads don't rescan), and badges inbox
// rows before they're opened. Rows are joined to verdicts via their
// data-legacy-last-message-id (confirmed against live Gmail). Idempotent and
// re-run on Gmail's virtual-scroll re-renders via a MutationObserver.
import { VerdictCache } from "../cache/verdictCache";
import { detectFeed } from "./parseFeed";
import type { Verdict } from "../engine";
import { ensureBadgeStyles, renderBadge, BADGE_CLASS, BADGED_ATTR } from "../ui/badge";
import { ensureBannerStyles, renderBanner, BANNER_CLASS, BANNERED_ATTR } from "../ui/banner";
import { normalizeToHex } from "./ids";

const ROW_ID_ATTR = "data-legacy-last-message-id";
const STATS_KEY = "msk:stats";

const cache = new VerdictCache();
const mem = new Map<string, Verdict>(); // fast synchronous lookup during a pass
const hydrated = new Set<string>(); // ids already looked up in storage

// The MAIN-world capture posts raw /i/fd feed text; parsing + detection run
// here (the ISOLATED world, where module imports are reliable).
window.addEventListener("message", (e: MessageEvent) => {
  const d = e.data as { source?: string; kind?: string; raw?: string } | null;
  if (!d || d.source !== "MSK" || d.kind !== "feed" || typeof d.raw !== "string") return;
  let verdicts: Map<string, Verdict>;
  try {
    verdicts = detectFeed(d.raw);
  } catch {
    return;
  }
  if (verdicts.size === 0) return;
  for (const [id, v] of verdicts) mem.set(id, v);
  cache.setMany(verdicts).catch(() => {});
  schedulePass();
});

let scheduled = false;
function schedulePass(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void badgePass();
    bannerPass();
    writeStats();
  });
}

async function badgePass(): Promise<void> {
  ensureBadgeStyles();
  const rows = document.querySelectorAll(`[${ROW_ID_ATTR}]`);
  const missing: string[] = [];

  for (const row of rows) {
    const id = row.getAttribute(ROW_ID_ATTR);
    if (!id) continue;
    const v = mem.get(id);
    if (v) applyBadge(row, v);
    else if (!hydrated.has(id)) missing.push(id);
  }

  if (missing.length === 0) return;
  missing.forEach((id) => hydrated.add(id));
  const fromCache = await cache.getMany(missing);
  if (fromCache.size === 0) return;
  for (const [id, v] of fromCache) mem.set(id, v);
  for (const row of document.querySelectorAll(`[${ROW_ID_ATTR}]`)) {
    const id = row.getAttribute(ROW_ID_ATTR);
    const v = id ? mem.get(id) : undefined;
    if (v) applyBadge(row, v);
  }
}

function applyBadge(row: Element, verdict: Verdict): void {
  if (!verdict.tracked) return;
  const container = row.closest("tr") ?? row;
  if (container.getAttribute(BADGED_ATTR) === "1" || container.querySelector(`.${BADGE_CLASS}`)) {
    return; // idempotent
  }
  const badge = renderBadge(verdict);
  if (!badge) return;
  container.setAttribute(BADGED_ATTR, "1");
  // First-pass placement: prepend into the row. Visual placement will be
  // refined against live Gmail (see docs/SPIKE.md notes).
  container.prepend(badge);
}

// Gmail list views have a short hash (#inbox, #search/foo); an opened thread
// appends a long id token. Used to gate the banner to the conversation view.
function isMessageOpen(): boolean {
  const parts = location.hash.replace(/^#/, "").split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return parts.length >= 2 && /^[A-Za-z0-9_-]{12,}$/.test(last);
}

// Banner the opened tracked message. List rows carry data-legacy-LAST-message-id;
// opened messages carry data-message-id / data-legacy-message-id, so those
// selectors naturally target the conversation view, not the list.
function bannerPass(): void {
  if (!isMessageOpen()) return;
  ensureBannerStyles();
  const els = document.querySelectorAll("[data-message-id],[data-legacy-message-id]");
  let candidates = 0;
  let matched = 0;
  for (const el of els) {
    const raw =
      el.getAttribute("data-legacy-message-id") ?? el.getAttribute("data-message-id") ?? "";
    const hex = normalizeToHex(raw);
    if (!hex) continue;
    candidates++;
    const v = mem.get(hex);
    if (!v?.tracked) continue;
    matched++;
    if (el.getAttribute(BANNERED_ATTR) === "1" || el.querySelector(`.${BANNER_CLASS}`)) continue;
    const banner = renderBanner(v);
    if (!banner) continue;
    el.setAttribute(BANNERED_ATTR, "1");
    el.prepend(banner);
  }
  // Diagnostic for the first live run: if we're in an open view with message
  // containers but none join a cached-tracked id, the id encoding/attribute
  // differs from what we expect — log it so we can adjust.
  if (candidates > 0 && matched === 0) {
    console.debug(`[MSK] banner: open view, ${candidates} msg containers, 0 matched cached-tracked ids`);
  }
}

// Publish view stats for the popup: how many currently-visible rows are tracked.
let lastInView = -1;
function writeStats(): void {
  let inView = 0;
  for (const row of document.querySelectorAll(`[${ROW_ID_ATTR}]`)) {
    const id = row.getAttribute(ROW_ID_ATTR);
    if (id && mem.get(id)?.tracked) inView++;
  }
  if (inView === lastInView) return;
  lastInView = inView;
  try {
    void chrome.storage.local.set({ [STATS_KEY]: { inView, updatedAt: Date.now() } });
  } catch {
    /* storage unavailable */
  }
}

function start(): void {
  new MutationObserver(() => schedulePass()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  schedulePass();
}

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start);

console.log("[MSK] collector ready");
