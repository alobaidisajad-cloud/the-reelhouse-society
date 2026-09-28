/**
 * logScreenPolish.guard.test.ts — batch 22, what only the SOURCE can promise.
 * ────────────────────────────────────────────────────────────────────────────
 * Batch 22's fixes are tested by what they DO, elsewhere:
 *   src/stores/__tests__/theLogSaysWhatHappened.test.ts   — what filing, amending,
 *     removing and the watchlist announce and toast, online, offline, failing
 *   src/hooks/__tests__/theSealLeavesWithTheScreen.test.tsx — the seal's timer,
 *     the dismissal and the review prompt when the member stays or leaves; the
 *     one error toast, told apart by its code
 *   src/components/__tests__/theDoorCanBeReadAndPressed + theToastHasOneHome —
 *     the toast speaks on both platforms, and an actionable one waits longer
 *   src/features/profile/__tests__/theDossierSealIsSpoken — the profile's seal
 *   app/log/__tests__/theLogPageMovesEveryCard — the labelled loading spinner
 *
 * What stays here is what a behaviour test cannot see: a NEW instance of a
 * class. A success exit someone adds tomorrow, a new internal caller of
 * updateLogOp, a new deferred pop anywhere in the app — none is exercised by a
 * test written today, so each is enumerated from the code.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readCode, MOBILE } from '@/test-utils/readCode';

const logOps = readCode('src/stores/domain/logSlice/helpers/logOperations.ts');

/** Every `updateLogOp(set, get, …)` call, read to its own matching close paren. */
function updateLogOpCalls(src: string): string[] {
  const out: string[] = [];
  const needle = 'updateLogOp(set, get,';
  for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + 1)) {
    let depth = 0;
    for (let i = at + 'updateLogOp'.length; i < src.length; i++) {
      if (src[i] === '(') depth++;
      else if (src[i] === ')' && --depth === 0) { out.push(src.slice(at, i + 1)); break; }
    }
  }
  return out;
}

describe('#89 · every success exit of filing announces — enumerated', () => {
  it('each bare `return;` in addLogOp (a success exit: failures throw) is preceded by an announcement', () => {
    // The announcement used to live in a `finally`, which covered every early
    // return by accident. Moved out, each exit needs its own; the audit after
    // the move found one missed. A new exit tomorrow is caught here.
    const lines = logOps.split('\n');
    const start = lines.findIndex((l) => /export const addLogOp/.test(l));
    const end = lines.findIndex((l, i) => i > start && /^export const /.test(l));
    expect(start).toBeGreaterThan(-1);
    const unannounced: string[] = [];
    for (let i = start; i < end; i++) {
      if (!/^\s*return;\s*$/.test(lines[i])) continue;
      const preceding = lines.slice(Math.max(start, i - 4), i).join('\n');
      if (!/announceToScreenReader\(/.test(preceding)) unannounced.push(`line ${i + 1}`);
    }
    expect(unannounced).toEqual([]);
  });
});

describe('#89 · every internal caller of updateLogOp is silent — enumerated', () => {
  it('uses the helper directly (the store action cannot forward opts) and passes silentAnnounce', () => {
    // updateLogOp narrates "Record amended". An op using it as a STEP narrates
    // the wrong action unless silenced: removeLogOp was, applyRewatchMerge was
    // missed. Behaviour tests cover those two; this catches a third.
    const start = logOps.indexOf('export const updateLogOp');
    const outsideItself = logOps.slice(0, start) + logOps.slice(logOps.indexOf('export const ', start + 10));
    expect(outsideItself).not.toMatch(/get\(\)\.updateLog\(/);
    const calls = updateLogOpCalls(logOps);
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toMatch(/silentAnnounce:\s*true/);
  });
});

describe('#111 · the log page scrolls to a named place, not a guessed one', () => {
  it('the screen and the style share ONE constant for the parallax padder', () => {
    // If these two ever disagree the scroll lands in the wrong place, which is
    // exactly what a bare `80` in the screen allowed.
    const screen = readCode('app/log/[id].tsx');
    const styles = readCode('src/components/log/logDetailStyles.ts');
    expect(screen).not.toMatch(/critiquesSectionY\.current = \d/);
    expect(screen).toMatch(/critiquesSectionY\.current = PARALLAX_PADDER_HEIGHT \+ y/);
    expect(styles).toMatch(/export const PARALLAX_PADDER_HEIGHT = \d+/);
    expect(styles).toMatch(/parallaxPadder: \{ height: PARALLAX_PADDER_HEIGHT/);
  });
});

describe('#89 · no screen both announces a success and toasts it', () => {
  it('a file may announce, or success-toast, but not both — the toast is spoken', () => {
    // Making the toast speak on iOS meant any flow that ALREADY announced and
    // also toasted the same outcome said it twice. The watchlist was one, and
    // its behaviour is now tested; these announce on paths with no toast.
    const sites = [
      'src/stores/domain/interactionSlice.ts',
      'src/features/profile/EditProfileScreen.tsx',
      'src/components/feed/ActivityCard.tsx',
    ];
    const both = sites.filter((f) => {
      const src = readCode(f);
      return /announceForAccessibility/.test(src) && /reelToast(\.success)?\s*\(/.test(src);
    });
    expect(both).toEqual([]);
  });
});

describe('#91 · the CLASS, swept app-wide — a deferred pop is always guarded', () => {
  it('no runAfterInteractions anywhere pops the stack unguarded', () => {
    // "A deferred back() that fires on a screen the member has left" pops
    // whatever they navigated to instead. useLogFlow is tested by behaviour;
    // this sweeps every other file, so a new screen cannot reopen it.
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
    // Read by BALANCING PARENS, not by shape: five call sites use the
    // brace-less `() => nav.back()`, which a shape-matching regex cannot see.
    const bodyAt = (src: string, open: number): string => {
      let depth = 0;
      for (let i = open; i < src.length; i++) {
        if (src[i] === '(') depth++;
        else if (src[i] === ')') { depth--; if (depth === 0) return src.slice(open + 1, i); }
      }
      return src.slice(open + 1);
    };
    // Every way this codebase pops a screen. A deferred push or replace after a
    // tap IS the member's intent and must still fire.
    const POP = /\b(nav|router)\.(back|dismiss|dismissAll|dismissTo|popToTop)\(/;
    const GUARDED = /isMounted\.current|mountedRef\.current/;
    const offenders: string[] = [];
    for (const file of [...walk(path.join(MOBILE, 'src')), ...walk(path.join(MOBILE, 'app'))]) {
      const rel = path.relative(MOBILE, file).split(path.sep).join('/');
      // _layout lives as long as the app. auth-callback must fire even if it
      // unmounts: a guard would strand an armed password recovery, and the
      // next launch would sign the member out. useLogFlow cancels its own
      // deferrals on unmount, which theSealLeavesWithTheScreen proves.
      if (rel === 'app/_layout.tsx' || rel === 'app/auth-callback.tsx' || rel === 'src/hooks/useLogFlow.ts') continue;
      const src = readCode(file);
      const needle = 'InteractionManager.runAfterInteractions';
      for (let at = src.indexOf(needle); at !== -1; at = src.indexOf(needle, at + needle.length)) {
        const body = bodyAt(src, src.indexOf('(', at + needle.length - 1));
        if (POP.test(body) && !GUARDED.test(body)) offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });
});
