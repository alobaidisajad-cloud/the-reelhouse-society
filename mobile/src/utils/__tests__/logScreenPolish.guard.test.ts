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

  it('editing a log confirms too — the same flow, the same seal', () => {
    // handleLog drives BOTH add and edit, and both end on the visual "RECORD
    // SEALED". Filing announced; amending said nothing. A blind member got
    // confirmation for one and silence for the other.
    expect(logOps).toMatch(/announceToScreenReader\('Record amended'\)/);
  });

  it('but NOT when another operation is only using it as a step', () => {
    // removeLogOp undoes a rewatch by calling updateLogOp. Without this, removing
    // a rewatch announced "Record amended" and then toasted "Rewatch removed" —
    // two announcements, the first of which is not what the member did.
    // Matched loosely on purpose: a later audit added `&& !queuedOffline` to this
    // same condition, and pinning the exact string made a correct change look
    // like a regression. What must hold is that the flag GATES the announcement.
    expect(logOps).toMatch(/if \(!opts\?\.silentAnnounce[^)]*\) announceToScreenReader/);
    expect(logOps).toMatch(/updateLogOp\(set, get, id, updates, \{ silentAnnounce: true \}\)/);
  });

  it('deleting needs no announcement of its own — it toasts, and toasts speak', () => {
    // Checked rather than assumed: removeLogOp shows success toasts on all three
    // of its paths, and the toast is now spoken on both platforms. Adding one
    // here would have made deletion say it twice.
    const start = logOps.indexOf('export const removeLogOp');
    const body = logOps.slice(start);
    expect(body).not.toMatch(/announceToScreenReader/);
    expect(body).toMatch(/removed\./);
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
    expect(toast).toMatch(/AccessibilityInfo\.announceForAccessibility\(/);
    expect(toast).toMatch(/toast\.message/);
  });

  it('the sibling live region gets the same treatment', () => {
    const profile = stripComments(read('src/features/profile/EditProfileScreen.tsx'));
    expect(profile).toMatch(/accessibilityLiveRegion="polite"/);
    expect(profile).toMatch(/Platform\.OS === 'ios'/);
  });

  it('an actionable toast announces its action too', () => {
    // A toast with an action stays up twice as long because it expects a
    // response. Announcing only the message would give a VoiceOver member five
    // seconds to act on a button they were never told about. Latent — nothing
    // fires an action toast yet — which is exactly why it needed pinning.
    expect(toast).toMatch(/toast\.action \? .*toast\.action\.label/);
    expect(toast).toMatch(/toast\.action \? 5000 : 2500/);
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

  it('the OTHER deferral mechanism is cancelled too', () => {
    // Clearing the timer was not enough. This hook also defers through
    // InteractionManager — three calls, none captured, two of them router.back().
    // Work already handed to the InteractionManager still runs on a screen the
    // member has left, popping whatever they navigated to. Three other files in
    // this codebase capture the handle for exactly this reason.
    expect(flow).toMatch(/pendingTasks/);
    expect(flow).toMatch(/pendingTasks\.current\.forEach\(t => t\.cancel\(\)\)/);
    // Every deferral goes through the cancellable helper — the raw API is used
    // once, inside it.
    expect((flow.match(/InteractionManager\.runAfterInteractions\(/g) ?? []).length).toBe(1);
    expect((flow.match(/deferUntilIdle\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
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

describe('#89 · a queued write is never announced as a finished one', () => {
  it('the offline branch does not fall through into the success announcement', () => {
    // The offline branch does NOT return — it fabricates finalData and keeps
    // going — so the success announcement at the end of the block ran for it
    // too. A member with no signal heard "Archived offline. Will sync when
    // connected." and then "Film logged to your archive": two sentences, the
    // second contradicting the first and describing something that had not
    // happened. Making the toast speak on iOS is what turned that into two
    // spoken sentences rather than one silent one.
    expect(logOps).toMatch(/if \(!queuedOffline\) announceToScreenReader\('Film logged to your archive'\)/);
    expect(logOps).toMatch(/!opts\?\.silentAnnounce && !queuedOffline/);
    // Both flags are actually raised where the write is queued, not just declared.
    expect((logOps.match(/queuedOffline = true/g) ?? []).length).toBe(2);
  });

  it('EVERY internal caller of updateLogOp is silent — enumerated', () => {
    // updateLogOp announces. Any op that uses it as a STEP therefore narrates
    // the wrong action unless it silences it. removeLogOp was fixed for exactly
    // this, and the lesson recorded — but the sweep for OTHER internal callers
    // was never actually run, and applyRewatchMerge was one: logging a film you
    // had already seen said "Record amended" before "Rewatch added to your
    // archive".
    //
    // The store action `updateLog` cannot forward opts, so going through it is
    // itself the bug. Internal callers must use the helper directly.
    const start = logOps.indexOf('export const updateLogOp');
    const outsideItself = logOps.slice(0, start) + logOps.slice(logOps.indexOf('export const ', start + 10));
    expect(outsideItself).not.toMatch(/get\(\)\.updateLog\(/);

    const calls = logOps.match(/updateLogOp\(set, get,[\s\S]*?\{ silentAnnounce: true \}\)/g) ?? [];
    expect(calls.length).toBe(4);
  });
});

describe('#91 · the CLASS, swept app-wide — a deferred pop is always guarded', () => {
  it('no runAfterInteractions anywhere pops the stack unguarded', () => {
    // Fixing useLogFlow alone was fixing the instance in front of me. The class is
    // "a deferred back() that fires on a screen the member has left" — it pops
    // whatever they navigated to instead. Sweeping found one more: list-modal,
    // which already used its own isMounted ref on four other lines INCLUDING the
    // catch of the same function, and both sibling modals guard this same call.
    // Enumerated rather than listed, so a new screen cannot reopen it.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (['node_modules', '__tests__', '.expo', 'android', 'ios'].includes(e.name)) continue;
          walk(full, out);
        } else if (/\.tsx?$/.test(e.name)) out.push(full);
      }
      return out;
    };

    // The body is read by BALANCING PARENS, not by matching a shape. A regex for
    // `() => { … }` cannot see `() => nav.back()`, and five real call sites use
    // that brace-less form — so a shape-matching guard would have passed while
    // the very defect it names walked straight through it.
    const bodyAt = (src: string, open: number): string => {
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(open + 1, i); }
      }
      return src.slice(open + 1);
    };

    // Every way this codebase pops a screen — not just the one that was filed.
    // back, dismiss, dismissAll and popToTop all remove something the member is
    // looking at; only these are dangerous when deferred. A deferred push or
    // replace after a tap IS the member's intent and must still fire.
    const POP = /\b(nav|router)\.(back|dismiss|dismissAll|dismissTo|popToTop)\(/;
    const GUARDED = /isMounted\.current|mountedRef\.current/;

    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))]) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/');
      // Two files are exempt, each for a REASON, not because they were awkward.
      //
      // _layout is mounted for the entire life of the app, so nothing it defers
      // can outlive it.
      //
      // auth-callback must fire even if it unmounts, and guarding it would CREATE
      // a bug rather than close one: the recovery branch arms `recovery_pending`
      // and only reset-password clears it. A guard that skipped the redirect
      // would strand the member with the flag still armed, and restoreSession
      // destroys the session of an abandoned recovery on next launch — so the
      // "safe" fix would sign them out. Its redirect is also the promise the
      // screen has already made on-screen ("Taking you to set a new password").
      if (rel === 'app/_layout.tsx' || rel === 'app/auth-callback.tsx') continue;
      const src = stripComments(fs.readFileSync(file, 'utf8'));
      const needle = 'InteractionManager.runAfterInteractions';
      let at = src.indexOf(needle);
      while (at !== -1) {
        const open = src.indexOf('(', at + needle.length - 1);
        const body = bodyAt(src, open);
        if (POP.test(body) && !GUARDED.test(body)) offenders.push(rel);
        at = src.indexOf(needle, at + needle.length);
      }
    }
    expect(offenders).toEqual([]);
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
