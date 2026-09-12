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
 * ── AND THE SINK IS DELIBERATELY EMPTY ──────────────────────────────────────
 * Where member behaviour is recorded is not an engineering decision. A vendor
 * SDK is a third party receiving your members' activity; a table is a schema
 * change and a privacy posture. This app has spent real care on what leaves it,
 * and quietly starting to ship behavioural events somewhere would undo that
 * without anybody deciding to. So this test pins that the seam exists, that
 * every gate reports through it, and that it is NOT yet wired anywhere.
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
    it('is NOT wired to anything — that decision is not an engineering one', () => {
      // If this ever fails, somebody chose a destination for member behaviour.
      // That is allowed; it should be a decision, not a diff nobody read.
      expect(SEAM).toMatch(/let sink: Sink \| null = null;/);
      expect(SEAM).toMatch(/export function setGateTelemetrySink/);
      // No vendor SDK has crept in.
      expect(SEAM).not.toMatch(/posthog|amplitude|mixpanel|segment|firebase/i);
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
