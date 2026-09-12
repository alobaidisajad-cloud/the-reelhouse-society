/**
 * theFunnelHasOneSeam.test.ts — marketing you cannot measure is decoration.
 * ─────────────────────────────────────────────────────────────────────────────
 * The whole point of this work was to sell the ranks from inside the app: show
 * the feature, gate the act, offer the door. There was no way to know whether
 * any of it worked. `useAnalytics` is the MEMBER'S analytics — Cinema DNA, the
 * Projector Room — not the product's.
 *
 * The funnel is four events: a rope tapped, the Society page opened, a rank
 * bought, a rank ended. Because all seventeen gates now come through one hook,
 * the first of those needed exactly one line — which is the argument for having
 * collapsed them before trying to measure anything.
 *
 * ── AND THE SINK NOW HAS A DESTINATION ──────────────────────────────────────
 * It shipped pointing nowhere on purpose, because where member behaviour is
 * recorded is a privacy decision rather than an engineering one. It points at
 * a first-party counter that records no identity of any kind — not a vendor
 * SDK, which the app's own published privacy policy rules out in as many
 * words. So this test pins the seam, pins that every gate reports through it,
 * and pins the three properties that made wiring it acceptable.
 */
import { readFileSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/.*$/gm, ' ');

const SEAM = read('src/utils/gateTelemetry.ts');

describe('the funnel has one seam', () => {
  it('the four events that make a funnel are all declared', () => {
    for (const e of ['gate_tapped', 'membership_opened', 'rank_purchased', 'rank_relinquished']) {
      expect(`${e}: ${SEAM.includes(`'${e}'`)}`).toBe(`${e}: true`);
    }
  });

  it('every rope reports, because every rope comes through one hook', () => {
    // The argument for the refactor, stated as a test: one line instruments
    // seventeen gates. If a gate ever stops going through useClearance it stops
    // being measured, and `aRankIsSoldEnforcedAndExplained` is what catches that.
    const hook = code(read('src/hooks/useClearance.ts'));
    expect(hook).toMatch(/recordGateEvent\('gate_tapped'/);
    // With the door it came from, or the event answers "somebody tapped
    // something" and nothing more.
    expect(hook).toMatch(/recordGateEvent\('gate_tapped', \{ featureId, rank, standing \}\)/);
  });

  it('the far end is instrumented too, or there is no conversion to read', () => {
    const membership = code(read('app/(modals)/membership.tsx'));
    expect(membership).toMatch(/recordGateEvent\('membership_opened'/);
    expect(membership).toMatch(/recordGateEvent\('rank_purchased'/);
    // Both carry the door that sent them, which is the only way to answer
    // "which rope leads to a rank" rather than "how many ranks were sold".
    expect(membership).toMatch(/featureId: cameFor\?\.id/);
  });

  it('and a rank ending is recorded as well as a rank beginning', () => {
    // Churn is half a funnel. Without it the numbers only ever go up.
    expect(code(read('src/lib/revenueCat.ts'))).toMatch(/recordGateEvent\('rank_relinquished'\)/);
  });

  describe('the sink', () => {
    /**
     * THE DECISION WAS MADE, AND THIS IS WHAT IT HOLDS TO.
     *
     * This block used to assert the sink was wired to nothing. It is wired now
     * — to a first-party counter that records no identity of any kind. What is
     * worth pinning is no longer "is it unwired" but the three properties that
     * made wiring it acceptable, because those are what a later diff could
     * quietly undo.
     */
    const SINK = read('src/lib/gateMetricsSink.ts');

    it('is wired, and still in exactly one place', () => {
      expect(SEAM).toMatch(/let sink: Sink \| null = null;/);
      expect(SEAM).toMatch(/export function setGateTelemetrySink/);
      // Exactly one installer, called from exactly one place. Two sinks mean
      // the second silently replaces the first and half the funnel vanishes.
      expect(SINK).toMatch(/setGateTelemetrySink\(/);
      const callers = ['app/_layout.tsx']
        .filter((p) => code(read(p)).includes('installGateMetricsSink()'));
      expect(callers).toEqual(['app/_layout.tsx']);
    });

    it('is FIRST-PARTY — the published privacy policy forbids the alternative', () => {
      // The live policy says the app integrates no "analytics platforms that
      // track individual users" and no third-party trackers. A vendor SDK here
      // would make that sentence false the day it shipped.
      //
      // Asserted against STRIPPED code, not the raw file: both of these files
      // name the vendors in prose, explaining why they are not used. Matching
      // the raw text failed on its own reasoning — the comment trap, where an
      // absence check is defeated by the comment that documents the absence.
      const VENDORS = /posthog|amplitude|mixpanel|segment|firebase|appsflyer|adjust/i;
      for (const f of [SEAM, SINK]) {
        expect(code(f)).not.toMatch(VENDORS);
      }
      // And the stripper really is removing the prose that would otherwise
      // match, rather than the files happening to be clean.
      expect(SINK).toMatch(VENDORS);
      expect(code(SINK)).toMatch(/supabase\s*\n?\s*\.rpc\('record_gate_event'/);
    });

    it('sends NOTHING that could name a member', () => {
      // The whole argument for allowing this at all. If a later diff adds a
      // user id, a device id or a session id to the payload, the counter stops
      // being a counter and becomes a behavioural record of a person.
      const payload = /\.rpc\('record_gate_event',\s*\{([\s\S]*?)\}\)/.exec(code(SINK));
      expect(payload).not.toBeNull();
      const keys = [...(payload?.[1] ?? '').matchAll(/(\w+):/g)].map((m) => m[1]);
      // A tripwire: if the regex ever stops finding the real call, an empty
      // key list would pass every assertion below vacuously.
      expect(keys.length).toBeGreaterThan(0);
      expect(keys.sort()).toEqual(['p_event', 'p_feature_id', 'p_rank', 'p_standing']);
    });

    it('cannot take a screen down with it', () => {
      // A member being refused a feature is already a bad moment. A crash on
      // top of it, from the code that was only ever meant to COUNT the moment,
      // is inexcusable.
      expect(code(SEAM)).toMatch(/try \{\s*sink\(event, detail\);\s*\} catch \{/);
    });

    it('leaves a breadcrumb regardless, and says why that is not measurement', () => {
      // Breadcrumbs surface only when something throws, so no rate can be read
      // from them — but they turn "it wouldn't let me in" into a readable trail.
      expect(code(SEAM)).toMatch(/addBreadcrumb\(/);
      expect(SEAM).toMatch(/NOT measurement/);
    });
  });
});
