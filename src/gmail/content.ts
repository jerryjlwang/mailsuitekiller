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

const ROW_ID_ATTR = "data-legacy-last-message-id";

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
  scheduleBadgePass();
});

let scheduled = false;
function scheduleBadgePass(): void {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    void badgePass();
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

function start(): void {
  new MutationObserver(() => scheduleBadgePass()).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  scheduleBadgePass();
}

if (document.body) start();
else document.addEventListener("DOMContentLoaded", start);

console.log("[MSK] collector ready");
