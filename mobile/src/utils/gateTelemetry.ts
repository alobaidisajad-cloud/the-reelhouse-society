/**
 * gateTelemetry — the funnel, with one place to point it at.
 * ─────────────────────────────────────────────────────────────────────────────
 * The point of this whole body of work was to market the ranks inside the app:
 * show the feature, gate the act, offer the door. There is currently no way to
 * know whether any of it works. `useAnalytics` is the MEMBER'S analytics —
 * Cinema DNA, the Projector Room, what they have watched — not the product's.
 *
 * Marketing you cannot measure is decoration, so this is the seam. Every rope
 * in the app reports through here.
 *
 * ── WHERE IT GOES, AND WHY THERE ────────────────────────────────────────────
 * This shipped with no destination on purpose: choosing where member behaviour
 * is recorded is a privacy decision, not an engineering one. The decision was
 * made deliberately and it is written out in `gateMetricsSink.ts`, which is the
 * only thing that ever calls `setGateTelemetrySink`.
 *
 * The short of it: not a vendor. The app's published privacy policy says it
 * integrates no "analytics platforms that track individual users", and PostHog
 * or Amplitude would make that false the day they shipped. Instead the events
 * increment a first-party per-day COUNTER keyed by (event, feature, rank,
 * standing) — no user, device or session id anywhere in it. Every event already
 * carries the door it came from, so the funnel still reads end to end without
 * anyone's name being part of it.
 *
 * Events also go to Sentry as breadcrumbs, which is genuinely useful — when a
 * member reports "it wouldn't let me in", the trail of ropes they met is right
 * there in the report — but that half is NOT measurement: breadcrumbs surface
 * only when something throws, so no conversion rate can be read from them.
 *
 * ── WHAT TO RECORD, IF A SINK IS ADDED ──────────────────────────────────────
 * Taps, opens and purchases are low-volume and answer the question: a member
 * meets a handful of ropes in their whole membership. IMPRESSIONS are the
 * expensive half — a dimmed panel is rendered on every scroll past it — and are
 * the least informative. Add them only with sampling, and only if a rate rather
 * than a count is actually needed.
 */
import { addBreadcrumb } from '@/src/lib/sentry';
import type { Rank } from '@/src/constants/gatedFeatures';

export type GateEvent =
  /** A member tapped a rope. The one event that means intent. */
  | 'gate_tapped'
  /** The Society page opened, carrying which door sent them. */
  | 'membership_opened'
  /** A rank was actually bought. */
  | 'rank_purchased'
  /** A rank ended, and the app noticed. */
  | 'rank_relinquished';

export interface GateEventDetail {
  /** A feature id from `gatedFeatures.ts` — never free text. */
  featureId?: string;
  rank?: Rank;
  /** Whether they had never held it, or held it and stopped. */
  standing?: 'stranger' | 'lapsed';
}

/**
 * THE SINK. Null until something installs one, which `installGateMetricsSink()`
 * does once from the root layout. It stays null here rather than importing the
 * destination directly, so this file has no opinion about where events go and
 * every test can run the whole funnel without a network.
 */
type Sink = (event: GateEvent, detail: GateEventDetail) => void;
let sink: Sink | null = null;

export function setGateTelemetrySink(next: Sink | null): void {
  sink = next;
}

export function recordGateEvent(event: GateEvent, detail: GateEventDetail = {}): void {
  // Breadcrumbs always: they cost nothing and they turn "it wouldn't let me in"
  // into a readable trail. They are not measurement.
  addBreadcrumb(
    `${event}${detail.featureId ? ` · ${detail.featureId}` : ''}${detail.standing ? ` · ${detail.standing}` : ''}`,
    'gate',
  );

  // Never let a telemetry sink take a screen down with it. A member being
  // refused a feature is already a bad moment; a crash on top of it is worse.
  if (!sink) return;
  try {
    sink(event, detail);
  } catch {
    // Deliberately silent. Nothing a measurement failure can say is worth
    // showing a member, and Sentry already has the breadcrumb above.
  }
}
