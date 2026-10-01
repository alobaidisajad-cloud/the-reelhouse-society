/**
 * anExportIsWhole.test.ts — a member's export holds every row once.
 *
 * The export read a thousand rows at a time with no order. Postgres does not
 * promise two pages of an unordered read agree, so a member past a thousand
 * logs could get an export with some twice and some missing. Every page is now
 * ordered by the table's key; the private notes' key is the viewing.
 */
import { readAllRows } from '../readAllRows';

interface Ask { table: string; eq: [string, unknown][]; order: [string, unknown][]; range: [number, number] | null }
const mockAsks: Ask[] = [];
let mockPages: { data: unknown[] | null; error: unknown }[] = [];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const ask: Ask = { table, eq: [], order: [], range: null };
      mockAsks.push(ask);
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = (k: string, v: unknown) => { ask.eq.push([k, v]); return chain; };
      chain.order = (k: string, o: unknown) => { ask.order.push([k, o]); return chain; };
      chain.range = (a: number, b: number) => {
        ask.range = [a, b];
        return Promise.resolve(mockPages.shift() ?? { data: [], error: null });
      };
      return chain;
    },
  },
}));

const rows = (n: number, from = 0) => Array.from({ length: n }, (_, i) => ({ id: `r${from + i}` }));

beforeEach(() => { mockAsks.length = 0; mockPages = []; });

describe('a member’s export', () => {
  it('orders every page by the table’s key, and reads on until a short page', async () => {
    mockPages = [{ data: rows(1000), error: null }, { data: rows(3, 1000), error: null }];
    const got = await readAllRows('u1', 'logs');
    expect(got).toHaveLength(1003);
    expect(mockAsks.map((a) => a.range)).toEqual([[0, 999], [1000, 1999]]);
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
