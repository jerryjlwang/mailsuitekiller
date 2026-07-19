# Increment 1 — Gmail prefetch feasibility spike

## The question

The PRD's #1 fragility, and the thing the whole product's value depends on:

> When Gmail loads the **inbox list**, does it fetch payloads containing full
> message **body HTML** (with `<img>` tags) **before** the user opens a message?

- **Yes →** we can scan those bodies and badge inbox rows _before open_ (the
  preventive core of the product).
- **No (bodies only arrive on open) →** row-level pre-open badging isn't
  possible via observation; we degrade to the on-open "scanned on open / late
  warning" path and design the UX around that honestly.

We answer this empirically before investing in the engine, cache, and UI.

## The instrument

Two content scripts (see `src/gmail/`), no network calls of our own — we only
_observe_ Gmail's own traffic:

- **`inject.ts`** — runs in the page **MAIN world** at `document_start`, so it
  monkeypatches the real `window.fetch` / `XMLHttpRequest` before Gmail's client
  uses them. For every `mail.google.com` response it counts `<img>` occurrences
  (raw, `<`-escaped, and `&lt;` entity forms, since Gmail escapes body HTML
  inside its RPC payloads) and `postMessage`s a report.
- **`content.ts`** — runs in the ISOLATED world, has chrome APIs, watches the
  URL hash to timestamp the first message-open, and tags each reported payload
  as arriving **BEFORE any open** (prefetchable) or after. Prints a rolling
  verdict every 5s.

## How to run it

```bash
npm install
npm run build          # emits dist/
```

Then, once:

1. Open `chrome://extensions`, enable **Developer mode** (top-right).
2. **Load unpacked** → select the `dist/` folder.
3. Open/refresh **https://mail.google.com** and open DevTools → **Console**.
4. Filter the console by `[MSK-spike]`.
5. Let the inbox settle for a few seconds **without opening anything**, then
   open a known-tracked email.

Read the `VERDICT so far` lines.

## Interpreting the output

- `body payloads BEFORE open: N (prefetch FEASIBLE ✅)` with **N > 0** and the
  payloads containing sensible `imgs=` counts → **prefetch works**; proceed with
  inbox-row badging as the primary surface.
- Only `after open ⏱` payloads, `prefetch NOT seen ❌` → **prefetch not
  available by observation**; pivot the plan to on-open detection with an explicit
  "late warning" state, and re-scope the inbox badge (User Story #12).
- Note _which_ endpoint/URL carries the bodies — that's the integration seam
  the `gmail/prefetch.ts` module will build on.

## Caveats

- MAIN-world manifest content scripts are reliable in Chrome 111+; if the very
  earliest fetches are missed, later ones still register.
- The open-detection heuristic keys off the URL hash; if a Gmail layout doesn't
  match, adjust `isMessageOpen()` in `content.ts`.
- This is a throwaway instrument. Once the question is answered, `inject.ts` /
  `content.ts` get replaced by the real integration layer.
