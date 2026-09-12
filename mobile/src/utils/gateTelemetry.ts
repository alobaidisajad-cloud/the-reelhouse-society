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
 * ── WHY IT HAS NO DESTINATION YET, ON PURPOSE ───────────────────────────────
 * Choosing where member behaviour is recorded is not an engineering decision.
 * A vendor SDK is a third party receiving your members' activity; a table in
 * your own database is a schema change and a privacy posture. This app has
 * spent a lot of care on what leaves it — column grants, anon visibility
 * checks, an anon-privacy bypass found and closed — and quietly starting to
 * ship behavioural events somewhere would undo that care without anybody
 * deciding to.
 *
 * So the seam exists and the sink is one function away. Until one is chosen the
 * events go to Sentry as breadcrumbs, which is genuinely useful — when a member
 * reports "it wouldn't let me in", the trail of ropes they met is right there in
 * the report — but it is NOT measurement: breadcrumbs surface only when
 * something throws, so no conversion rate can be read from them.
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
 * THE SINK. Null until somebody decides where member behaviour is allowed to
 * go. Wire it once, in one place, and every rope in the app is measured.
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
