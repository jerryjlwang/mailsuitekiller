import type { Verdict, Category } from "../engine";

// Reads the verdict cache + view stats straight from chrome.storage (no
// messaging needed) and renders a summary. "Total tracked seen" is every
// tracked verdict cached so far; "in current view" is published by the content
// script for the active tab's inbox.

const CACHE_PREFIX = "msk:v:";
const STATS_KEY = "msk:stats";

interface CacheEntry {
  v: Verdict;
}

function primaryCategory(v: Verdict): Category {
  if (v.trackers.some((t) => t.category === "personal")) return "personal";
  if (v.trackers.some((t) => t.category === "bulk")) return "bulk";
  return "unknown";
}

function set(id: string, value: number): void {
  const el = document.getElementById(id);
  if (el) el.textContent = String(value);
}

async function load(): Promise<void> {
  const all = await chrome.storage.local.get(null);
  let total = 0;
  const counts: Record<Category, number> = { personal: 0, bulk: 0, unknown: 0 };

  for (const [key, val] of Object.entries(all)) {
    if (!key.startsWith(CACHE_PREFIX)) continue;
    const verdict = (val as CacheEntry | undefined)?.v;
    if (verdict?.tracked) {
      total++;
      counts[primaryCategory(verdict)]++;
    }
  }

  const stats = all[STATS_KEY] as { inView?: number } | undefined;
  set("inview", stats?.inView ?? 0);
  set("total", total);
  set("personal", counts.personal);
  set("bulk", counts.bulk);
  set("unknown", counts.unknown);
}

void load();
