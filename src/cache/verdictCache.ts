import { SIGNATURE_VERSION } from "../engine";
import type { Verdict } from "../engine";

// Per-message verdict cache so each message is analysed once and Gmail stays
// fast across re-renders. Entries carry the signature-list version they were
// produced under; when the list is updated, stale entries are ignored (treated
// as a miss) rather than served, so verdicts refresh on the next scan.

interface CacheEntry {
  v: Verdict;
  s: number; // SIGNATURE_VERSION at write time
}

/** Minimal async KV surface, so tests can inject an in-memory backend. */
export interface AsyncStorage {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

const PREFIX = "msk:v:";
const key = (messageId: string) => PREFIX + messageId;

function chromeStorage(): AsyncStorage {
  return {
    get: (keys) => chrome.storage.local.get(keys),
    set: (items) => chrome.storage.local.set(items),
  };
}

export class VerdictCache {
  private store: AsyncStorage;

  constructor(store?: AsyncStorage) {
    this.store = store ?? chromeStorage();
  }

  async getMany(messageIds: string[]): Promise<Map<string, Verdict>> {
    if (messageIds.length === 0) return new Map();
    const raw = await this.store.get(messageIds.map(key));
    const out = new Map<string, Verdict>();
    for (const id of messageIds) {
      const entry = raw[key(id)] as CacheEntry | undefined;
      if (entry && entry.s === SIGNATURE_VERSION) out.set(id, entry.v);
    }
    return out;
  }

  async get(messageId: string): Promise<Verdict | null> {
    return (await this.getMany([messageId])).get(messageId) ?? null;
  }

  async setMany(verdicts: Iterable<[string, Verdict]>): Promise<void> {
    const items: Record<string, CacheEntry> = {};
    let n = 0;
    for (const [id, v] of verdicts) {
      items[key(id)] = { v, s: SIGNATURE_VERSION };
      n++;
    }
    if (n > 0) await this.store.set(items);
  }
}
