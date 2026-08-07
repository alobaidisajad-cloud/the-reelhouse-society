/**
 * logScreenPolish.guard.test.ts — batch 22
 * ────────────────────────────────────────
 * Five filed findings and two unfiled. Each is pinned to the SIBLING that already
 * did it right, because that sibling is what proved the defect unintentional.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const logOps = stripComments(read('src/stores/domain/logSlice/helpers/logOperations.ts'));
const flow = stripComments(read('src/hooks/useLogFlow.ts'));

describe('#89 · a screen reader is never told a failure succeeded', () => {
  it('the success announcement is OUT of the finally', () => {
    // A `finally` runs on the throw paths too, so a VoiceOver member heard
    // "Film logged to your archive" while the screen showed an error.
    const finallyBlock = logOps.slice(logOps.indexOf('} finally {'), logOps.indexOf('} finally {') + 200);
    expect(finallyBlock).not.toMatch(/announceForAccessibility|announceToScreenReader/);
  });

  it('every success path announces — including the early-returning merge', () => {
    // The rewatch merge returns before the end of the try. It used to be covered
    // by the finally by accident; moving the announcement without covering it
    // would have made a successful merge silent.
    expect(logOps).toMatch(/announceToScreenReader\('Film logged to your archive'\)/);
    expect(logOps).toMatch(/announceToScreenReader\('Rewatch added to your archive'\)/);
  });

  it('failures are NOT announced from the store — the toast speaks now', () => {
    // Announcing here as well would make Android say it twice: its live region
    // already reads the toast.
    expect(logOps).not.toMatch(/announceToScreenReader\('[^']*fail/i);
  });

  it('EVERY success exit announces — enumerated, not spot-checked', () => {
    // The announcement used to live in a `finally`, which covered every early
    // return by accident. Moving it means each success exit needs its own — and
    // there are three, not the one that is obvious. The post-execution audit
    // found a missed one here; this test is why it cannot happen twice.
    const lines = logOps.split(/\r?\n/);
    const start = lines.findIndex(l => /export const addLogOp/.test(l));
    const end = lines.findIndex((l, i) => i > start && /^export const /.test(l));
    expect(start).toBeGreaterThan(-1);

    const unannounced: string[] = [];
    for (let i = start; i < end; i++) {
      // A bare `return;` inside this function is a SUCCESS exit — failures throw.
      if (!/^\s*return;\s*$/.test(lines[i])) continue;
      const preceding = lines.slice(Math.max(start, i - 4), i).join('\n');
      if (!/announceToScreenReader\(/.test(preceding)) unannounced.push(`line ${i + 1}`);
    }
    expect(unannounced).toEqual([]);
  });
});

describe('#89 · the toast is the one spoken channel, on BOTH platforms', () => {
  const toast = stripComments(read('src/components/ToastOverlay.tsx'));

  it('announces on iOS, where the live region does not fire', () => {
    // accessibilityLiveRegion is declared @platform android by React Native, and
    // accessibilityRole="alert" does not announce on iOS. So every toast in the
    // app — including every error — was silent to VoiceOver on iPhone.
    expect(toast).toMatch(/accessibilityLiveRegion="polite"/);
    expect(toast).toMatch(/Platform\.OS === 'ios'/);
    expect(toast).toMatch(/AccessibilityInfo\.announceForAccessibility\(toast\.message\)/);
  });

  it('the sibling live region gets the same treatment', () => {
    const profile = stripComments(read('src/features/profile/EditProfileScreen.tsx'));
    expect(profile).toMatch(/accessibilityLiveRegion="polite"/);
    expect(profile).toMatch(/Platform\.OS === 'ios'/);
  });
});

describe('#90 · one toast per failure, and the right one', () => {
  it('the store no longer toasts on any path it also throws from', () => {
    for (const gone of [
      'Failed to seal record',
      'Failed to update log — changes reverted',
      'Failed to remove log',
      'System is currently sealing another record',
      'System is busy updating a record',
    ]) {
      expect(logOps).not.toContain(gone);
    }
  });

  it('the reason travels as a CODE, not as prose', () => {
    // Matching an error's MESSAGE is what batch 16 proved fragile.
    expect(logOps).toMatch(/export const LOG_BUSY/);
    expect((logOps.match(/code: LOG_BUSY/g) ?? []).length).toBe(2);
    expect(flow).toMatch(/\)\?\.code === LOG_BUSY/);
  });

  it('the screen still distinguishes "still saving" from "it failed"', () => {
    expect(flow).toMatch(/Still sealing the previous record/);
    expect(flow).toMatch(/The record could not be sealed/);
  });
});

describe('#91 · the dismissal timer cannot fire after the screen is gone', () => {
  it('it is stored and cleared, like the draft timer beside it', () => {
    expect(flow).toMatch(/sealTimerRef/);
    expect(flow).toMatch(/sealTimerRef\.current = setTimeout/);
    expect(flow).toMatch(/clearTimeout\(sealTimerRef\.current\)/);
  });

  it('the bare timer is gone', () => {
    // It called router.back() and asked for a store review — on a screen the
    // member may already have left.
    const publish = flow.slice(flow.indexOf('setSealed(true)'));
    expect(publish.slice(0, 200)).not.toMatch(/^\s*setTimeout\(/m);
  });
});

describe('#107 · a spinner, not a blank screen', () => {
  const screen = stripComments(read('app/log/[id].tsx'));

  it('the loading branch shows something', () => {
    expect(screen).not.toMatch(/if \(loading\) return <View style=\{s\.container\} \/>/);
    expect(screen).toMatch(/ActivityIndicator/);
  });

  it('using the centring style the not-found branch already uses', () => {
    expect(screen).toMatch(/\[s\.container, s\.centerFull\]/);
  });
});

describe('#111 · the scroll target is named, not guessed', () => {
  const screen = stripComments(read('app/log/[id].tsx'));
  const styles = stripComments(read('src/components/log/logDetailStyles.ts'));

  it('the literal is gone and the constant is shared', () => {
    expect(screen).not.toMatch(/critiquesSectionY\.current = 80 \+ y/);
    expect(screen).toMatch(/critiquesSectionY\.current = PARALLAX_PADDER_HEIGHT \+ y/);
    expect(styles).toMatch(/export const PARALLAX_PADDER_HEIGHT = 80/);
  });

  it('and the style that produced the number uses it too', () => {
    // If these two ever disagree the scroll lands in the wrong place, which is
    // exactly what a bare literal in the screen allowed.
    expect(styles).toMatch(/parallaxPadder: \{ height: PARALLAX_PADDER_HEIGHT/);
  });
});

describe('unfiled · batch 16\'s duplicate test reaches this file too', () => {
  it('no loose "unique" substring match survives', () => {
    // `42P10` reads "there is no UNIQUE or exclusion constraint…", so the old
    // test read a broken statement as a successful duplicate.
    expect(logOps).not.toMatch(/\/duplicate\|unique\|23505\/i/);
  });

  it('SQLSTATE first, with the prose narrowed to the real wording', () => {
    expect(logOps).toMatch(/duplicate key value violates unique constraint/);
    expect((logOps.match(/isDuplicateKey\(error\)/g) ?? []).length).toBe(2);
  });
});
