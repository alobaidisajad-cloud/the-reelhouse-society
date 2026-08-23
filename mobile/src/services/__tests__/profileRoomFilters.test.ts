/**
 * profileRoomFilters.test.ts — the four filters, against the query they send.
 *
 * A filter that silently does nothing is the worst kind: the chip lights, the
 * list changes (because the CLIENT half still filters the 150 rows in hand),
 * and a member with 300 discs never learns that "A–Z" only alphabetised the
 * first half of their vault. So these assert what reaches PostgREST, not what
 * the room renders.
 *
 * The service is driven for real and the calls are captured; nothing here
 * re-declares what it is checking.
 */
import { ProfileDataService } from '../ProfileDataService';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/utils/withAbortSignal', () => ({ withAbortSignal: (q: unknown) => q }));

/** Every builder call the service made, in order. */
type Call = { method: string; args: unknown[] };
let calls: Call[] = [];

/**
 * A chain that records instead of querying, and resolves to `rows`.
 *
 * `then` is what makes it awaitable: the service awaits the builder itself
 * rather than calling a terminal method, exactly as supabase-js allows.
 */
function mockChain(rows: unknown[]) {
  const record = (method: string) => jest.fn((...args: unknown[]) => { calls.push({ method, args }); return chain; });
  const chain: Record<string, unknown> = {
    select: record('select'),
    eq: record('eq'),
    gte: record('gte'),
    lt: record('lt'),
    gt: record('gt'),
    or: record('or'),
    ilike: record('ilike'),
    contains: record('contains'),
    order: record('order'),
    limit: record('limit'),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null }),
  };
  return chain;
}

const used = (method: string) => calls.filter(c => c.method === method);
const argsOf = (method: string) => used(method).map(c => c.args);

beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  (supabase.from as jest.Mock).mockImplementation(() => mockChain([]));
});

const ARCHIVIST = { id: 'u1', tier: 'archivist', role: 'member', is_founding: false } as never;

// ════════════════════════════════════════════════════════════════════════════
// THE LEDGER'S 4+
// ════════════════════════════════════════════════════════════════════════════
describe('the ledger’s 4+ is a RANGE, not an equality', () => {
  it('sends gte(4), never eq', async () => {
    await ProfileDataService.fetchOtherUserLogs('u1', 50, undefined, undefined, { rating: 'high' });
    expect(argsOf('gte')).toContainEqual(['rating', 4]);
    // `.eq('rating', 'high')` is a 22P02 against an integer column: the numeric
    // branch has to be checked SECOND or the sentinel falls into it.
    expect(argsOf('eq').some(a => a[0] === 'rating')).toBe(false);
  });

  it('still sends eq for a single rating', async () => {
    await ProfileDataService.fetchOtherUserLogs('u1', 50, undefined, undefined, { rating: 3 });
    expect(argsOf('eq')).toContainEqual(['rating', 3]);
    expect(argsOf('gte').some(a => a[0] === 'rating')).toBe(false);
  });

  it('filters on nothing at all for ALL', async () => {
    await ProfileDataService.fetchOtherUserLogs('u1', 50, undefined, undefined, { rating: 'all' });
    expect(argsOf('eq').some(a => a[0] === 'rating')).toBe(false);
    expect(argsOf('gte').some(a => a[0] === 'rating')).toBe(false);
  });

  it('takes the floor from the shared constant, not a literal', async () => {
    // The chip reads `${LEDGER_HIGH_FLOOR}+`. If the query hard-coded its own 4
    // the label and the filter could drift, and the label would be the lie.
    const { LEDGER_HIGH_FLOOR } = require('@/src/types');
    await ProfileDataService.fetchOtherUserLogs('u1', 50, undefined, undefined, { rating: 'high' });
    expect(argsOf('gte')).toContainEqual(['rating', LEDGER_HIGH_FLOOR]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE WATCHLIST'S DECADE
// ════════════════════════════════════════════════════════════════════════════
describe('a decade is a half-open range', () => {
  it('asks for [1990, 2000), which is the ten years in it', async () => {
    await ProfileDataService.fetchOtherUserWatchlist('u1', 50, undefined, undefined, { decade: 1990 });
    expect(argsOf('gte')).toContainEqual(['year', 1990]);
    expect(argsOf('lt')).toContainEqual(['year', 2000]);
    // `.lte('year', 1999)` would be equivalent for integers and wrong the day
    // the column becomes a date. Half-open is the form that survives that.
  });

  it('bounds BOTH ends — an open top would return every later film', async () => {
    await ProfileDataService.fetchOtherUserWatchlist('u1', 50, undefined, undefined, { decade: 1970 });
    expect(argsOf('gte').some(a => a[0] === 'year')).toBe(true);
    expect(argsOf('lt').some(a => a[0] === 'year')).toBe(true);
  });

  it('filters on nothing for null, and does not confuse it with a year', async () => {
    await ProfileDataService.fetchOtherUserWatchlist('u1', 50, undefined, undefined, { decade: null });
    expect(argsOf('gte').some(a => a[0] === 'year')).toBe(false);
    expect(argsOf('lt').some(a => a[0] === 'year')).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE TWO SHELF SORTS
// ════════════════════════════════════════════════════════════════════════════
describe('a sort moves the ORDER BY and the cursor together', () => {
  /** The ordering columns the query asked for, in order. */
  const orderedBy = () => argsOf('order').map(a => [a[0], (a[1] as { ascending?: boolean })?.ascending]);

  it('the vault sorts on the title column when asked, and always ties on id', async () => {
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, undefined, undefined, { sort: 'az' });
    expect(orderedBy()).toContainEqual(['film_title', true]);
    expect(orderedBy()).toContainEqual(['id', true]);
    // The tie-breaker must ascend WITH the primary, or the two disagree at a
    // duplicate title and a row lands on both pages.
  });

  it('the vault descends on za', async () => {
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, undefined, undefined, { sort: 'za' });
    expect(orderedBy()).toContainEqual(['film_title', false]);
    expect(orderedBy()).toContainEqual(['id', false]);
  });

  it('the vault keeps its chronological default', async () => {
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, undefined, undefined, {});
    expect(orderedBy()).toContainEqual(['created_at', false]);
  });

  it('the stacks sort on `title` — the lists table names it differently', async () => {
    // `lists.title` vs `watchlists.film_title`. Sharing one hard-coded column
    // name across the three would 400 at run time on two of them.
    await ProfileDataService.fetchOtherUserLists('u1', 50, undefined, undefined, { sort: 'az' });
    expect(orderedBy()).toContainEqual(['title', true]);
  });

  it('the stacks never reorder the films INSIDE a stack', async () => {
    // `rank_position` is the member's own chosen sequence. Sorting the shelf
    // must not touch what is on it.
    await ProfileDataService.fetchOtherUserLists('u1', 50, undefined, undefined, { sort: 'za' });
    const inner = argsOf('order').find(a => a[0] === 'rank_position');
    expect(inner).toBeDefined();
    expect((inner![1] as { ascending?: boolean }).ascending).toBe(true);
  });

  it('a cursor filters on the SAME column the sort ordered by', async () => {
    // The silent failure this whole helper exists for: order by title, page by
    // created_at, and page two returns rows page one already showed.
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, 'Alien|17', undefined, { sort: 'az' });
    const keyset = argsOf('or').map(a => String(a[0])).find(s => s.includes('gt.') || s.includes('lt.'));
    expect(keyset).toContain('film_title.gt.');
    expect(keyset).not.toContain('created_at');
  });

  it('a cursor descends when the sort does', async () => {
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, 'Alien|17', undefined, { sort: 'za' });
    const keyset = argsOf('or').map(a => String(a[0])).find(s => s.includes('lt.'));
    expect(keyset).toContain('film_title.lt.');
  });

  it('a title carrying a quote cannot escape the filter', async () => {
    await ProfileDataService.fetchOtherUserVault(ARCHIVIST, 50, 'A "Cut"|17', undefined, { sort: 'az' });
    const keyset = argsOf('or').map(a => String(a[0])).find(s => s.includes('film_title'));
    // Doubled, as PostgREST expects — an unescaped quote ends the value and the
    // rest of the title is parsed as filter syntax.
    expect(keyset).toContain('""Cut""');
  });
});

// ════════════════════════════════════════════════════════════════════════════
// THE CLASS — a filter in the UI that never reaches the server
// ════════════════════════════════════════════════════════════════════════════
describe('every filter the controller holds reaches the query that pages it', () => {
  const { readFileSync } = require('fs');
  const { join } = require('path');
  const ROOT = join(__dirname, '..', '..', '..');
  const read = (f: string) => readFileSync(join(ROOT, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

  /**
   * Enumerated from the source, never listed by hand.
   *
   * This is the shape that has failed twice on this page: a hand-written list
   * of things to check says nothing about the thing that was just added. Every
   * piece of filter state in the controller is found mechanically, and each one
   * must appear in the effect that pushes filters to the server.
   */
  const controller = read('src/hooks/useProfileController.ts');
  const filterState = [...controller.matchAll(/const \[(\w*(?:Filter|Sort|Search|Decade|Sieve))\s*,/g)].map(m => m[1]);

  it('finds the filter state at all', () => {
    // A regex that matches nothing would pass every assertion below.
    expect(filterState.length).toBeGreaterThanOrEqual(8);
  });

  /**
   * The BODY of a hook, with its dependency array cut off.
   *
   * ⚠️ THE WHOLE POINT. A first version of both checks below sliced up to the
   * closing `}, [...])` — which INCLUDED the deps array, where every filter is
   * named whether or not the body does anything with it. A mutation pass proved
   * it: deleting `physicalSort` from the pull-to-refresh branch left the name
   * sitting in the deps and both assertions still passed. The guard existed and
   * guarded nothing.
   */
  function hookBody(src: string, startAnchor: string, endAnchor: string): string {
    const start = src.indexOf(startAnchor);
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf(endAnchor, start);
    expect(end).toBeGreaterThan(start);
    const body = src.slice(start, end);
    // Belt and braces: if a deps array ever creeps back into the slice, say so
    // here rather than passing quietly for the next several years.
    expect(body).not.toMatch(/\}\s*,\s*\[/);
    return body;
  }

  it('each one is pushed to the server by the filter effect', () => {
    const effect = hookBody(
      controller,
      'refreshTabRef.current(',
      // The deps array's own opening — everything before it is body. Anchoring
      // on the comment above it does not work: `read()` strips comments. And a
      // multi-line anchor does not work either: these files are CRLF.
      '}, [archiveSieve',
    );
    const missing = filterState.filter(name => !effect.includes(name));
    expect(missing).toEqual([]);
  });

  it('each one also survives a pull-to-refresh', () => {
    // Two of the four filtered tabs used to fall through to a plain reload, so
    // pulling to refresh a filtered room silently refilled it UNFILTERED while
    // the chip stayed lit.
    const handler = hookBody(
      controller,
      'const onRefresh = useCallback',
      // The deps array's own opening — see above.
      '}, [data, activeTab',
    );
    const missing = filterState.filter(name => !handler.includes(name));
    expect(missing).toEqual([]);
  });
});
