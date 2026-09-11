/**
 * logoutClearsEveryModuleCache.test.ts — the caches a store keeps OUTSIDE itself.
 * ─────────────────────────────────────────────────────────────────────────────
 * `resetAllStores` clears zustand state. It cannot see module-level variables,
 * so each store's registered reset has to clear those by hand — and a hand-list
 * is a list somebody forgets to add to.
 *
 * `lounge.ts` keeps six. The reset cleared five. The one it walked past was the
 * send throttle, so the next member to sign in on the same phone inherited the
 * last one's timings and their opening message in a recently-used room came
 * back false in silence — the throttle being the only refusal that raises no
 * toast.
 *
 * This test does not check five names. It ENUMERATES the module-level mutable
 * caches from the source and requires the reset to mention every one, so the
 * seventh cache cannot quietly become the next exception.
 */
import fs from 'node:fs';
import path from 'node:path';

const STORE = path.resolve(__dirname, '../lounge.ts');
const src = fs.readFileSync(STORE, 'utf8');

const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** The body of the registerStoreReset(...) callback. */
const resetBody = (): string => {
  const code = stripComments(src);
  const at = code.indexOf('registerStoreReset(');
  expect(at).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = code.indexOf('(', at); i < code.length; i += 1) {
    if (code[i] === '(') depth += 1;
    else if (code[i] === ')') { depth -= 1; if (depth === 0) return code.slice(at, i); }
  }
  throw new Error('registerStoreReset call never closes');
};

/**
 * Module-level mutable state: a top-level `let`, or a top-level `const` holding
 * a Map or a Set. A `const` number or a frozen table cannot drift between
 * members and is not in scope here.
 */
const moduleCaches = (): string[] => {
  const code = stripComments(src);
  const names = new Set<string>();
  for (const m of code.matchAll(/^let\s+(_[A-Za-z0-9_]+)/gm)) names.add(m[1]);
  for (const m of code.matchAll(/^const\s+(_[A-Za-z0-9_]+)\s*(?::[^=]+)?=\s*new\s+(?:Map|Set)\b/gm)) {
    names.add(m[1]);
  }
  return [...names];
};

describe('logout clears what the store keeps outside itself', () => {
  it('finds the module-level caches — the sweep is not empty', () => {
    // A sweep that matches nothing passes in silence.
    expect(moduleCaches().length).toBeGreaterThanOrEqual(5);
  });

  it('EVERY module-level cache is named in the reset — enumerated', () => {
    const body = resetBody();
    const missed = moduleCaches().filter((n) => !body.includes(n));
    expect(missed).toEqual([]);
  });

  it('the send throttle specifically is cleared, not merely mentioned', () => {
    // It was the one that was missed, so it gets its own line.
    expect(resetBody()).toMatch(/_lastSendAt\.clear\(\)/);
  });

  it('the realtime channel is torn down, not just forgotten', () => {
    // Nulling the reference left the socket live and messages kept arriving
    // into a store the reset had just cleared.
    const body = resetBody();
    expect(body).toMatch(/removeChannel\(/);
    expect(body).toMatch(/_activeChannel\s*=\s*null/);
  });
});
