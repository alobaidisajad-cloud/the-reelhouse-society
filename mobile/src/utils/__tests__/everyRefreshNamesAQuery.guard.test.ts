/**
 * everyRefreshNamesAQuery.guard.test.ts — review round 3
 * ──────────────────────────────────────────────────────
 * A refresh asks the cache by a key's opening words. Two screens asked for ['stacks'] after a
 * stack was filed, amended or deleted, and the Reel's stacks are ['feed', 'stacks', …]: the
 * request matched nothing, said nothing, and the Reel showed the old set. Three more asked for
 * queries that had moved into stores long before (['lounge_members'], ['lounge_membership'],
 * ['user']).
 *
 * Every key the code refreshes, cancels, removes or writes must open a key some query of the app
 * is made with: each quoted word it names is the key's own word there, or falls where the key
 * holds a value (a filter, an id).
 */
import { readCode } from '@/test-utils/readCode';
import { files as universe, rel } from '@/test-utils/universe';

/**
 * The quoted words a key opens with, up to the first that is not a quoted word; `open` when a
 * value follows them (a filter, an id), which may be any word a refresh names.
 */
const openingWords = (from: string): { words: string[]; open: boolean } => {
  const words: string[] = [];
  const re = /^\s*'([^']*)'\s*(,|\])/;
  let rest = from;
  for (;;) {
    const m = re.exec(rest);
    if (!m) return { words, open: !/^\s*\]/.test(rest) };
    words.push(m[1]);
    if (m[2] === ']') return { words, open: false };
    rest = rest.slice(m[0].length);
  }
};

const CACHE_ACTS = /(invalidateQueries|removeQueries|cancelQueries|refetchQueries|resetQueries|setQueriesData|getQueriesData)\(\s*\{\s*queryKey:\s*\[/g;
const KEYED_ACTS = /(setQueryData|getQueryData)\(\s*\[/g;

type Key = { words: string[]; open: boolean; file: string };

const sweep = () => {
  const made: Key[] = [];
  const asked: Key[] = [];
  for (const abs of universe('appCode')) {
    const file = rel(abs);
    if (file.includes('__tests__')) continue;
    const code = readCode(file);
    const askedAt = new Set<number>();
    for (const re of [CACHE_ACTS, KEYED_ACTS]) {
      for (const m of code.matchAll(re)) {
        const at = (m.index ?? 0) + m[0].length;
        askedAt.add(code.lastIndexOf('[', at));
        const key = openingWords(code.slice(at));
        if (key.words.length) asked.push({ ...key, file });
      }
    }
    for (const m of code.matchAll(/queryKey:\s*\[/g)) {
      const at = (m.index ?? 0) + m[0].length;
      if (askedAt.has(at - 1)) continue;
      const key = openingWords(code.slice(at));
      if (key.words.length) made.push({ ...key, file });
    }
  }
  return { made, asked };
};

/**
 * A query's key that a refresh's words open: every word they share is the same, and a refresh
 * naming more words than the key quotes reaches into its value (['feed', 'stacks', filter, …]
 * opened by ['feed', 'stacks', 'following']).
 */
const opens = (made: { words: string[]; open: boolean }, asked: string[]) =>
  asked.every((w, i) => (i < made.words.length ? made.words[i] === w : made.open));

describe('every refresh names a query the app makes', () => {
  const { made, asked } = sweep();

  it('finds the queries and the refreshes (neither sweep is empty)', () => {
    expect(made.length).toBeGreaterThan(20);
    expect(asked.length).toBeGreaterThan(20);
    // The Reel's stacks are found as made, and asked as the screens that change a stack ask.
    expect(made.some((k) => opens(k, ['feed', 'stacks']))).toBe(true);
    expect(asked.filter((k) => opens({ words: k.words, open: false }, ['feed', 'stacks'])).map((k) => k.file).sort())
      .toEqual(expect.arrayContaining(['app/(modals)/list-modal.tsx', 'app/stacks/[id].tsx']));
  });

  it('no refresh asks for a key no query is made with', () => {
    const nowhere = asked
      .filter((a) => !made.some((m) => opens(m, a.words)))
      .map((a) => `${a.file}: [${a.words.map((w) => `'${w}'`).join(', ')}]`);
    expect(nowhere).toEqual([]);
  });

  it('would catch the one that was there', () => {
    expect(made.some((m) => opens(m, ['stacks']))).toBe(false);
    // And a word a key quotes otherwise is not taken for its value.
    expect(made.some((m) => opens(m, ['feed', 'lists']))).toBe(false);
  });
});
