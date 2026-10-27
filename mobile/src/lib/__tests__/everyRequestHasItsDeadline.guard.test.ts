/**
 * EVERY REQUEST HAS ITS DEADLINE — the finder, as a test (P4.6).
 *
 * The deadline lives in one place, the shared fetch (fetchWithinLimit, src/lib/supabase.ts),
 * which every supabase-js call already uses. A request made with fetch( anywhere else waits on
 * the phone's own networking, which on Android has no limit: TMDB's reads kept a timer of their
 * own, three tries of it, and the store's rank sync none at all. So fetch( is called in the
 * shared fetch alone, found through the syntax tree (`fetch(`, `globalThis.fetch(`), and a
 * member call that only shares the name (`refetch(`, `query.fetch(`) is not counted.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import ts from 'typescript';
import { files, rel } from '@/test-utils/universe';

const ROOT = join(__dirname, '..', '..', '..');
const HOME = 'src/lib/supabase.ts';

/** Every place a file asks the network itself, as `line`. */
export function fetchesIn(file: string, text: string): number[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: number[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n)) {
      const c = n.expression;
      const bare = ts.isIdentifier(c) && c.text === 'fetch';
      const global = ts.isPropertyAccessExpression(c) && c.name.text === 'fetch'
        && ts.isIdentifier(c.expression) && ['globalThis', 'global', 'window'].includes(c.expression.text);
      if (bare || global) out.push(sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

const census: Record<string, number[]> = {};
for (const f of files('appCode', { ext: ['.ts', '.tsx'] }).map(rel)) {
  const found = fetchesIn(f, readFileSync(join(ROOT, f), 'utf8'));
  if (found.length) census[f] = found;
}

describe('every request has its deadline', () => {
  it('asks the network itself in the shared fetch alone', () => {
    expect(Object.keys(census)).toEqual([HOME]);
  });

  it('tells a request from a name that is only spelled the same', () => {
    const n = (src: string) => fetchesIn('probe.ts', src).length;
    expect(n('await fetch(url, init);')).toBe(1);
    expect(n('await globalThis.fetch(url);')).toBe(1);
    expect(n('void refetch(); query.fetch(); store.getState().fetch();')).toBe(0);
  });
});
