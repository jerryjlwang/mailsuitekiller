// Public contract of the detection engine. This module has NO Chrome, DOM, or
// Gmail dependencies — its only input is email body HTML.

/**
 * How a tracker was categorised.
 * - `personal`: a per-recipient tracker attached by an individual sender
 *   (Mailsuite, Yesware, Streak…). These are the ones the user actually cares
 *   about — badge them loudly.
 * - `bulk`: open-tracking by a mass-mail platform / ESP (Mailchimp, SendGrid…).
 *   Nearly all commercial mail has this; badged quietly to avoid fatigue.
 * - `unknown`: a heuristic-only hit — a suspicious hidden pixel we can't
 *   attribute to a known service.
 */
export type Category = "personal" | "bulk" | "unknown";

/**
 * Strength of the verdict. `confirmed` means at least one known-tracker
 * signature matched; `suspected` means only heuristics fired. Only meaningful
 * when `tracked` is true.
 */
export type Confidence = "confirmed" | "suspected";

export interface Evidence {
  /** The (proxy-unwrapped) image URL that triggered the flag. */
  imageUrl: string;
  /** Human-readable reason, shown in the in-message banner. */
  reason: string;
}

export interface Tracker {
  /** Display name, e.g. "Mailsuite". "Unknown tracker" for heuristic hits. */
  name: string;
  category: Category;
  evidence: Evidence;
}

export interface Verdict {
  tracked: boolean;
  confidence: Confidence;
  trackers: Tracker[];
}
