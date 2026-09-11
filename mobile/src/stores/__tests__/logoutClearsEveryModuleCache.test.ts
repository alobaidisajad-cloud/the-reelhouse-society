/**
 * logoutClearsEveryModuleCache.test.ts — the state a store keeps OUTSIDE itself.
 * ─────────────────────────────────────────────────────────────────────────────
 * `resetAllStores` clears zustand state. It cannot see module-level variables,
 * so each store's registered reset has to clear those by hand — and a hand-list
 * is a list somebody forgets to add to. Twice, here:
 *
 *   lounge.ts     kept six and cleared five. The missed one was the send
 *                 throttle, so the next member on the phone inherited the last
 *                 one's timings and their opening message in a recently-used
 *                 room came back false in silence.
 *
 *   dispatch.ts   kept `inflight` and `generation` and cleared neither. `fetch`
 *                 opens with `if (inflight) return inflight`, so a member
 *                 signing in while the previous member's request was still in
 *                 the air was handed THAT promise, which failed its own member
 *                 check, painted nothing, and left them on an empty Dispatch
 *                 until they pulled to refresh.
 *
 * ── WHY THIS SWEEPS EVERY STORE AND NOT JUST THE TWO ────────────────────────
 * The first version of this file checked lounge.ts alone, and the first version
 * of the sweep behind it matched only names beginning with an underscore — so
 * it reported dispatch.ts as having ZERO module caches while it held two. A
 * probe that depends on a naming convention answers "clean" for every file that
 * does not follow it. It now reads every top-level `let` and every top-level
 * `const` holding a Map or a Set, whatever it is called, in every store that
 * registers a reset.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Files that register a logout reset — the ones this rule applies to. */
const storesWithResets = (): string[] =>
  execFileSync('git', ['ls-files', 'src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((f) => /\.ts$/.test(f) && !/__tests__|\.test\./.test(f))
    .filter((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').includes('registerStoreReset('));

/** The source of a balanced call expression starting at `at`. */
const callAt = (code: string, at: number): string => {
  if (at === -1) return '';
  let depth = 0;
  for (let i = code.indexOf('(', at); i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') { depth -= 1; if (depth === 0) return code.slice(at, i); }
  }
  return '';
};

/**
 * The reset, PLUS the bodies of any same-file helpers it calls.
 *
 * A reset is allowed to delegate, and dispatch.ts does: it calls
 * `invalidateInflight()`, which clears `inflight` and bumps `generation`
 * without naming either at the call site. Reading the reset alone reported that
 * as two uncleared caches — the guard being strict about the wrong thing. One
 * level of indirection is followed; deeper than that and the reset should say
 * what it clears.
 */
const resetBody = (code: string): string => {
  const direct = callAt(code, code.indexOf('registerStoreReset('));
  if (!direct) return '';
  let expanded = direct;
  for (const m of direct.matchAll(/(?:^|[^.\w])([a-zA-Z_][\w]*)\s*\(\s*\)/g)) {
    const name = m[1];
    if (name === 'registerStoreReset') continue;
    const decl = new RegExp(`(?:^|\\n)\\s*(?:const|function)\\s+${name}\\b`).exec(code);
    if (!decl) continue;
    const start = decl.index + decl[0].indexOf(name);
    // the helper's own body, bounded by its braces
    const brace = code.indexOf('{', start);
    if (brace === -1) continue;
    let depth = 0;
    for (let i = brace; i < code.length; i += 1) {
      if (code[i] === '{') depth += 1;
      else if (code[i] === '}') {
        depth -= 1;
        if (depth === 0) { expanded += '\n' + code.slice(brace, i); break; }
      }
    }
  }
  return expanded;
};

/**
 * Module-level MUTABLE state: a top-level `let`, or a top-level `const` holding
 * a Map or a Set. A top-level `const` number or a frozen table cannot drift
 * between members and is not in scope.
 */
const moduleCaches = (code: string): string[] => {
  const names = new Set<string>();
  for (const m of code.matchAll(/^let\s+([A-Za-z_][A-Za-z0-9_]*)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^const\s+([A-Za-z_][A-Za-z0-9_]*)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set)\b/gm)) {
    names.add(m[1]);
  }
  return [...names];
};

describe('logout clears what a store keeps outside itself', () => {
  it('finds stores and finds caches — neither sweep is empty', () => {
    // A sweep that reads nothing passes in silence, which is how the first
    // version of this test missed dispatch.ts entirely.
    const stores = storesWithResets();
    expect(stores.length).toBeGreaterThanOrEqual(5);

    const withCaches = stores.filter(
      (f) => moduleCaches(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))).length > 0,
    );
    expect(withCaches.length).toBeGreaterThanOrEqual(2);
  });

  it('EVERY module cache in EVERY store is named in that store’s reset', () => {
    const offences: string[] = [];
    for (const f of storesWithResets()) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'));
      const body = resetBody(code);
      const missed = moduleCaches(code).filter((n) => !body.includes(n));
      if (missed.length) offences.push(`${f}: ${missed.join(', ')}`);
    }
    expect(offences).toEqual([]);
  });

  it('the lounge send throttle is cleared, not merely mentioned', () => {
    const code = stripComments(fs.readFileSync(path.join(ROOT, 'src/stores/lounge.ts'), 'utf8'));
    expect(resetBody(code)).toMatch(/_lastSendAt\.clear\(\)/);
  });

  it('the lounge realtime channel is torn down, not just forgotten', () => {
    // Nulling the reference left the socket live, and messages kept arriving
    // into a store the reset had just cleared.
    const body = resetBody(stripComments(fs.readFileSync(path.join(ROOT, 'src/stores/lounge.ts'), 'utf8')));
    expect(body).toMatch(/removeChannel\(/);
    expect(body).toMatch(/_activeChannel\s*=\s*null/);
  });

  it('the Dispatch drops the in-flight fetch AND bumps its generation', () => {
    // Only bumping the generation discards the stale answer and still hands
    // back the stale promise, so the page stays empty either way.
    const body = resetBody(stripComments(fs.readFileSync(path.join(ROOT, 'src/stores/dispatch.ts'), 'utf8')));
    expect(body).toMatch(/invalidateInflight\(\)/);
  });
});
