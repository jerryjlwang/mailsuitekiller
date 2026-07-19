## Problem Statement

Email tracking services like Mailsuite (formerly Mailtrack), Yesware, Streak, and HubSpot let senders embed an invisible tracking pixel in their emails. When the recipient opens the email, the pixel image is fetched and the sender is notified — often with a timestamp and open count. The recipient has no idea this is happening.

This creates an asymmetric social problem: you open an important email, can't respond right away, and the sender now *knows* you read it and didn't reply. You are silently pressured into either replying before you're ready or looking like you're ignoring them. The only defenses today are blunt (disable all images in Gmail, which breaks legitimate email) or invisible (Gmail's image proxy hides your IP but still fires the open event).

The recipient deserves the same information the sender has: to know, **before opening an email**, that it will report the open back to the sender.

## Solution

A Chrome extension for Gmail (web) that detects tracking pixels in received email and surfaces that fact to the user:

- **In the inbox list, before the email is opened:** tracked emails get a visible badge on their row, so the user can decide whether to open a tracked email at all. This is the core of the product — a warning that appears only after opening is worthless, because the pixel has already fired by then.
- **Inside an opened email:** a banner identifies the tracker by name when known ("This email is tracked by Mailsuite") and shows the evidence (the pixel URL / why it was flagged).
- Detection combines a curated list of known tracker signatures (for attribution) with heuristics that catch unknown or self-hosted trackers (tiny/hidden images with unique per-recipient tokens).

The extension is detection-only in v1: it informs, it does not block. Everything runs locally in the browser; the extension makes no network calls of its own — an anti-tracking tool that phones home would be self-defeating.

## User Stories

1. As a Gmail user, I want tracked emails to be visibly badged in my inbox list before I open them, so that I can decide whether and when to open an email knowing the sender will be notified.
2. As a Gmail user, I want to see which tracking service is used ("Tracked by Mailsuite"), so that I know who is watching and how (a salesperson's personal tracker vs. a newsletter platform).
3. As a Gmail user, I want a banner inside an opened tracked email showing the evidence for the verdict, so that I can trust the detection isn't a false alarm.
4. As a Gmail user, I want personal-tracker services (Mailsuite, Yesware, Streak, etc.) visually distinguished from bulk-mail/ESP open tracking (Mailchimp, SendGrid), so that badge fatigue from newsletters doesn't drown out the trackers I actually care about.
5. As a Gmail user, I want emails with unknown-but-suspicious pixels (1×1 hidden images with unique tokens) flagged as "likely tracked", so that self-hosted or new trackers don't slip through.
6. As a Gmail user, I want detection to work on emails inside threads, so that a tracked reply in a long conversation is flagged even when earlier messages are clean.
7. As a Gmail user, I want each message in a multi-message thread assessed individually, so that I know which specific message is tracked.
8. As a Gmail user, I want detection verdicts cached per message, so that Gmail stays fast and messages aren't rescanned on every render.
9. As a privacy-conscious user, I want the extension to make zero external network requests and collect zero analytics, so that the anti-tracking tool is not itself a tracker.
10. As a Gmail user, I want the extension to work with Gmail's image proxy (googleusercontent URLs), so that trackers are recognized even though Gmail rewrites every image URL.
11. As a Gmail user, I want a popup showing a summary (what was detected in the current view, total tracked emails seen), so that I have a sense of how prevalent tracking is in my inbox.
12. As a Gmail user, I want the extension to keep working when inbox-level prefetch breaks (Gmail changes its internals), degrading to on-open detection with a clear "late warning" state, so that a Gmail update never silently turns the extension into a false sense of security.
13. As a Gmail user with multiple signed-in accounts, I want detection to work in every Gmail account tab (`/u/0`, `/u/1`, …), so that my work and personal accounts are both covered.
14. As a Gmail user, I want forwarded emails containing someone else's tracking pixel flagged too, so that I know an open event may be reported to a third party, not just the sender.
15. As a user who occasionally gets false positives, I want the banner to show exactly which image triggered the verdict, so that I can judge borderline cases myself.
16. As the maintainer, I want the tracker signature list to be a versioned data file separate from code, so that adding a new tracker is a one-line change and not a code change.
17. As the maintainer, I want the detection engine to be a pure function with no Chrome or Gmail dependencies, so that it can be tested against a corpus of HTML fixtures in isolation.

## Implementation Decisions

**Platform and scope**
- Chrome extension, Manifest V3. Gmail web only in v1 (Mailsuite and its peers are Gmail-centric).
- Detection only — no pixel blocking, no link rewriting in v1. Link-click tracking is entirely out of scope for v1.
- All processing is local. The extension has no backend, makes no external requests, and collects no telemetry. Host permissions limited to Gmail origins.

**Architecture — four modules**
1. **Detection engine** (the deep module): a pure function taking a message's raw HTML and returning a verdict — `{ tracked, confidence, trackers: [{ name, category, evidence }] }`. It contains the signature matching, the heuristics, and the Gmail-proxy URL unwrapping. No Chrome APIs, no DOM globals, no Gmail knowledge beyond "input is email body HTML". This module rarely changes interface and absorbs all future detection improvements.
2. **Gmail integration layer**: the content script responsible for obtaining message HTML and message identity. Two paths: (a) inbox-level prefetch — reading message content the same way Gmail's own client loads it, so verdicts exist before the user opens anything; (b) on-open DOM extraction as the fallback path. This module is deliberately quarantined: it is the only part coupled to Gmail's undocumented internals and is expected to be the maintenance hotspot.
3. **UI layer**: inbox-row badge injection, in-message banner with attribution and evidence, and the extension popup. Distinct visual treatment for "personal tracker" vs. "bulk/ESP tracking" vs. "suspected (heuristic-only)".
4. **Verdict cache**: message-id → verdict in extension storage, so each message is analyzed once. Cache entries carry the signature-list version so verdicts are invalidated when the list is updated.

**Detection approach**
- Signature list: curated JSON data file of known tracker pixel URL patterns with display name and category (personal-tracker vs. bulk-ESP). Initial coverage targets at minimum: Mailsuite/Mailtrack, Yesware, Streak, HubSpot, Mixmax, Salesloft, Outreach, Boomerang, Gmelius, Superhuman, plus major ESPs (Mailchimp, SendGrid, Constant Contact) in the bulk category.
- Heuristics (for unknown trackers): images with 0/1-pixel dimensions or hidden styling whose URLs carry long unique tokens; scored to a "suspected tracking" verdict distinct from confirmed signature matches.
- Gmail rewrites all external image URLs through its caching proxy; the engine must recover the original URL from the proxied form before matching, since signatures are written against original tracker domains.

**Key behavioral decisions**
- The inbox badge is the primary surface; on-open detection alone is explicitly insufficient (the pixel fires at open). If prefetch is unavailable, the UI must communicate that verdicts are late ("scanned on open") rather than pretending to be preventive.
- Per-message verdicts within threads; the thread row badge reflects any tracked message in the thread.
- False-positive posture: confirmed signature matches are stated as fact with attribution; heuristic-only hits are presented as "likely tracked" with the triggering image shown as evidence.

**Risk register**
- Gmail's internal message-loading endpoints are undocumented and change without notice — this is the top fragility. Mitigations: quarantine in the integration module, degrade to on-open detection, keep the failure state visible to the user.
- Gmail DOM class names are obfuscated and unstable; badge/banner injection must key off structural selectors and be resilient to re-renders (Gmail is a virtual-scrolled SPA; MutationObserver-driven, idempotent injection).
- Signature list staleness: tracker domains change; the list is a data file so updates ship as trivial releases.

## Testing Decisions

- A good test exercises external behavior through the module's public interface — HTML in, verdict out — never internal helpers or intermediate state.
- **The detection engine is the only module with automated tests.** Test corpus: HTML fixtures of real tracked emails (one per supported tracker, as captured from Gmail with proxied URLs), heuristic-catchable unknown trackers, and false-positive traps (legitimate small images: logos, spacer gifs in newsletters that aren't per-recipient tokenized, signature images). Each fixture asserts the full verdict: tracked/not, attribution name, category, evidence.
- The signature list file gets a schema-validation test so a malformed entry can't ship.
- Gmail integration and UI layers are verified manually against live Gmail; automating against Gmail's obfuscated, changing DOM is brittle and low-value. This is a deliberate ~40%-coverage posture concentrated on the critical path (the verdict).
- No prior art in the repo (greenfield); fixture-based pure-function testing is the pattern to establish.

## Out of Scope

- **Blocking or stripping tracking pixels** — v1 informs only. (Natural v2: block by default with per-email "mark as read for sender" override.)
- **Link-click tracking** — no detection or rewriting of wrapped/redirect links in v1.
- Outlook web, Apple Mail, mobile Gmail, or any client other than Gmail web on desktop Chrome.
- Read-receipt headers (MDN/DSN), attachment tracking (e.g., DocSend), and calendar-invite tracking.
- Any server-side component, account system, or cross-device sync.
- Firefox/Safari ports (MV3 code should avoid gratuitous Chrome-isms, but no porting work in v1).

## Further Notes

- Prior art worth studying: Ugly Email (inbox-level badging via Gmail internals, the UX benchmark for "warn before open"), PixelBlock and Trocker (simpler on-render approaches). Ugly Email's longevity demonstrates the prefetch approach is viable but maintenance-heavy.
- Nearly all commercial bulk email is open-tracked; without the personal/bulk category split the badge would appear on ~everything and lose all signal. The category distinction is a product feature, not a nicety.
- The name "mailsuitekiller" notwithstanding, detection is generic; Mailsuite is simply the flagship signature.
