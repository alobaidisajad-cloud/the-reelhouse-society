/**
 * anExportIsWhole.test.ts — a member's export holds every row once.
 *
 * The export read a thousand rows at a time with no order. Postgres does not
 * promise two pages of an unordered read agree, so a member past a thousand
 * logs could get an export with some twice and some missing. Every page is now
 * ordered by the table's key, and begins after the last key read; the private
 * notes' key is the viewing.
 */
import { readAllRows } from '../readAllRows';

interface Ask { table: string; eq: [string, unknown][]; order: [string, unknown][]; gt: [string, unknown] | null; limit: number | null }
const mockAsks: Ask[] = [];
let mockPages: { data: unknown[] | null; error: unknown }[] = [];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const ask: Ask = { table, eq: [], order: [], gt: null, limit: null };
      mockAsks.push(ask);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => { ask.eq.push([k, v]); return chain; };
      chain.order = (k: string, o: unknown) => { ask.order.push([k, o]); return chain; };
      chain.gt = (k: string, v: unknown) => { ask.gt = [k, v]; return chain; };
      chain.limit = (n: number) => {
        ask.limit = n;
        return Promise.resolve(mockPages.shift() ?? { data: [], error: null });
      };
      return chain;
    },
  },
}));

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${String(from + i).padStart(5, '0')}` }));

beforeEach(() => { mockAsks.length = 0; mockPages = []; });

describe('a member’s export', () => {
  it('orders every page by the table’s key, begins each after the last key read, and reads on until a short page', async () => {
    mockPages = [{ data: rows(1000), error: null }, { data: rows(3, 1000), error: null }];
    const got = await readAllRows('u1', 'logs');
    expect(got).toHaveLength(1003);
    expect(mockAsks.map((a) => [a.gt, a.limit])).toEqual([[null, 1000], [['id', 'r00999'], 1000]]);
    for (const a of mockAsks) {
      expect(a.order).toEqual([['id', { ascending: true }]]);
      expect(a.eq).toEqual([['user_id', 'u1']]);
    }
  });

  it('orders by the key it is given (the private notes are keyed by viewing)', async () => {
    mockPages = [{ data: rows(2), error: null }];
    await readAllRows('u1', 'log_private_notes', '*', 'viewing_id');
    expect(mockAsks[0].order).toEqual([['viewing_id', { ascending: true }]]);
  });

  it('a row removed between two pages moves nothing: the next page still begins after the last row read', async () => {
    // Paged by count, the house's second page would begin one row later once a row of the first was
    // removed, and skip a row; asked after the last key, it begins where the first page ended.
    mockPages = [{ data: rows(1000), error: null }, { data: rows(1, 1000), error: null }];
    await readAllRows('u1', 'logs');
    expect(mockAsks[1]?.gt).toEqual(['id', 'r00999']);
  });

  it('refuses a partial export: a page that fails throws', async () => {
    mockPages = [{ data: rows(1000), error: null }, { data: null, error: { message: 'TypeError: Network request failed' } }];
    await expect(readAllRows('u1', 'logs')).rejects.toEqual({ message: 'TypeError: Network request failed' });
  });

  it('every call in the vault names the right key', () => {
    const { readFileSync } = jest.requireActual('fs') as typeof import('fs');
    const { join } = jest.requireActual('path') as typeof import('path');
    const { stripComments } = jest.requireActual('@/test-utils/readCode');
    const vault = stripComments(readFileSync(join(__dirname, '..', 'DataVault.tsx'), 'utf8'));
    const notes = vault.match(/fetchAllRows\('log_private_notes'[^)]*\)/g) ?? [];
    expect(notes.length).toBeGreaterThan(0);
    for (const call of notes) expect(call).toMatch(/'viewing_id'/);
  });
});
