/**
 * gateMetricsSink — where the funnel goes, now that it goes somewhere.
 * ─────────────────────────────────────────────────────────────────────────────
 * `gateTelemetry.ts` deliberately shipped with a null sink, because choosing a
 * destination for member behaviour is a privacy decision. This is that decision
 * made, and the reasoning belongs next to the code that acts on it.
 *
 * ── NOT A VENDOR, AND NOT A CLOSE CALL ──────────────────────────────────────
 * The published privacy policy — live on the web, already relied on by the
 * existing userbase — says, in its own words:
 *
 *     "We do not use third-party trackers or advertising pixels."
 *     "We do not integrate any advertising networks, social media trackers, or
 *      analytics platforms that track individual users."
 *
 * PostHog, Amplitude, Mixpanel or Segment would each make that sentence false
 * the day it shipped, and would add a third party to an app whose Sentry setup
 * already refuses to send more than a pseudonymous id. The funnel is not worth
 * breaking that for, and it does not need to be: everything the funnel has to
 * answer is answerable from counts.
 *
 * ── SO IT COUNTS, AND NAMES NOBODY ──────────────────────────────────────────
 * `record_gate_event` increments a per-day counter keyed by
 * (event, feature, rank, standing). There is no user id, no device id, no
 * session id and no timestamp finer than a day — nothing that could be joined
 * back to a member, by us or by anyone who ever reads the table. Because every
 * event already carries the door it came from, the whole funnel still reads:
 *
 *     taps('the-archive') → opens('the-archive') → purchases('the-archive')
 *
 * "Which rope leads to a rank" was always a ratio of counts. It never needed a
 * name attached to it.
 *
 * ── AND IT CANNOT COST ANYTHING ─────────────────────────────────────────────
 * A member meets a handful of ropes in an entire membership, so this is a
 * handful of calls per lifetime, not per session — no batching, no queue, no
 * background flush to get wrong. The table is capped at 500 rows per day by the
 * function itself, so it stays small at any number of members.
 */
import { supabase } from '@/src/lib/supabase';
import { setGateTelemetrySink, type GateEvent, type GateEventDetail } from '@/src/utils/gateTelemetry';

/**
 * Installs the sink. Called once, from the root layout.
 *
 * Every failure here is swallowed on purpose. A member meeting a rope is
 * already a small disappointment; a measurement call is not allowed to make it
 * a crash, a log line they see, or a delay before the Society page opens.
 */
export function installGateMetricsSink(): void {
  setGateTelemetrySink((event: GateEvent, detail: GateEventDetail) => {
    const counted = supabase.rpc('record_gate_event', {
      p_event: event,
      // '' rather than null: these are primary-key columns server-side, and a
      // null in a key turns every upsert into a new row.
      p_feature_id: detail.featureId ?? '',
      p_rank: detail.rank ?? '',
      p_standing: detail.standing ?? '',
    });

    /**
     * Deliberately not awaited: nothing downstream waits on a counter, and
     * holding the tap open to write one would be measurement changing the
     * thing it measures.
     *
     * Wrapped in `Promise.resolve` because PostgREST's builder is a thenable,
     * not a Promise — it has no `.catch`, so an offline member would raise an
     * unhandled rejection from the code that was only ever meant to count.
     */
    void Promise.resolve(counted).then(
      () => undefined,
      () => undefined,
    );
  });
}
