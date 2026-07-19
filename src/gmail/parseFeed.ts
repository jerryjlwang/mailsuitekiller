import { detect } from "../engine";
import type { Verdict } from "../engine";

// Segments a Gmail /sync/u/N/i/fd prefetch response into per-message body HTML.
//
// This is the quarantined seam that depends on Gmail's undocumented sync feed.
// It is deliberately path-independent: rather than hardcode the deep array
// indices (which Gmail reshuffles), it walks the parsed JSON and uses one rule
// established empirically (see docs/SPIKE.md):
//
//   The nearest enclosing array that has a 16-hex-digit string as a DIRECT
//   child (Gmail's legacy message id — the inbox row's data-legacy-message-id)
//   owns every HTML body string in its subtree.
//
// So body parts group by their owning message id, and a message with several
// MIME parts yields one concatenated body.

export interface PrefetchedMessage {
  /** 16-hex legacy message id; matches the inbox row's data-legacy-message-id. */
  messageId: string;
  html: string;
}

const HEX_ID = /^[0-9a-f]{16}$/i;
const HTML_TAG =
  /<(?:div|img|a|table|td|tr|p|span|body|br|font|html|head|meta|style|o:p)[\s/>]/i;

function isHexId(s: string): boolean {
  return HEX_ID.test(s);
}

function isBodyHtml(s: string): boolean {
  return s.length >= 64 && HTML_TAG.test(s);
}

/** Split a Gmail sync response into its top-level JSON array blocks. */
function extractBlocks(raw: string): string[] {
  const txt = raw.replace(/^\)\]\}'?\s*/, "");
  try {
    JSON.parse(txt);
    return [txt];
  } catch {
    /* chunked / length-prefixed — scan for balanced top-level arrays */
  }

  const out: string[] = [];
  let i = 0;
  while (i < txt.length) {
    if (txt[i] !== "[") {
      i++;
      continue;
    }
    let depth = 0;
    let inStr = false;
    let esc = false;
    const start = i;
    for (; i < txt.length; i++) {
      const c = txt[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === "[") depth++;
      else if (c === "]" && --depth === 0) {
        out.push(txt.slice(start, i + 1));
        i++;
        break;
      }
    }
  }
  return out;
}

function walk(node: unknown, currentId: string | null, groups: Map<string, string[]>): void {
  if (typeof node === "string") {
    if (currentId && isBodyHtml(node)) {
      const parts = groups.get(currentId);
      if (parts) parts.push(node);
      else groups.set(currentId, [node]);
    }
    return;
  }
  if (Array.isArray(node)) {
    let id = currentId;
    for (const el of node) {
      if (typeof el === "string" && isHexId(el)) {
        id = el;
        break;
      }
    }
    for (const el of node) walk(el, id, groups);
    return;
  }
  if (node && typeof node === "object") {
    for (const v of Object.values(node)) walk(v, currentId, groups);
  }
}

export function parsePrefetchedMessages(raw: string): PrefetchedMessage[] {
  const groups = new Map<string, string[]>();
  for (const block of extractBlocks(raw)) {
    let json: unknown;
    try {
      json = JSON.parse(block);
    } catch {
      continue;
    }
    walk(json, null, groups);
  }
  return [...groups].map(([messageId, parts]) => ({ messageId, html: parts.join("\n") }));
}

/** Parse a prefetch response and run the detection engine over each message. */
export function detectFeed(raw: string): Map<string, Verdict> {
  const verdicts = new Map<string, Verdict>();
  for (const { messageId, html } of parsePrefetchedMessages(raw)) {
    verdicts.set(messageId, detect(html));
  }
  return verdicts;
}
