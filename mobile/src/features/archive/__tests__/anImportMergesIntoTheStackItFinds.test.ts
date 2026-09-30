/**
 * anImportMergesIntoTheStackItFinds.test.ts — an import meeting a stack the
 * member already has.
 *
 * An import merges a stack into the member's own stack of the same title. The
 * lookup was `maybeSingle()` with its error unread: a member holding two stacks
 * of that title got an error (two rows), read as "none", and every import made
 * one more copy; any failed read did the same. And the ReelHouse-archive path
 * then wrote the FILE's settings over the member's — an older export could make
 * a private stack public. The CSV path already kept them; now both do, through
 * one lookup (findOwnStack).
 */
import { importArchiveJSON } from '../archiveImport';

const mockUpserts: { table: string; rows: Record<string, unknown>[] }[] = [];
let mockLookup: { data: unknown; error: unknown } = { data: [], error: null };

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {};
      for (const m of ['select', 'eq', 'order', 'limit', 'range', 'in', 'is']) chain[m] = () => chain;
      chain.upsert = (rows: Record<string, unknown>[]) => {
        mockUpserts.push({ table, rows });
        return Promise.resolve({ data: null, error: null });
      };
      // As the old lookup asked: one row or none, and an error it never read.
      chain.maybeSingle = () => Promise.resolve({
        data: Array.isArray(mockLookup.data) ? (mockLookup.data[0] ?? null) : null, error: mockLookup.error,
      });
      chain.then = (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
        Promise.resolve(table === 'lists' ? mockLookup : { data: [], error: null }).then(res, rej);
      return chain;
    },
    rpc: async () => ({ data: null, error: null }),
  },
}));

const archive = (over: Record<string, unknown> = {}) => ({
  lists: [{ title: 'Silents', description: 'From the file.', isPrivate: false, isRanked: false, films: [], ...over }],
}) as never;

const listWrites = () => mockUpserts.filter((u) => u.table === 'lists').flatMap((u) => u.rows);

beforeEach(() => { mockUpserts.length = 0; });

describe('an import meeting a stack the member already has', () => {
  it('a lookup that failed makes no copy, and says so', async () => {
    mockLookup = { data: null, error: { message: 'TypeError: Network request failed' } };
    const result = await importArchiveJSON(archive(), 'member-1');
    expect(listWrites()).toEqual([]);
    expect(result.lists).toBe(0);
    expect(result.errors.join(' ')).toMatch(/Silents/);
  });

  it('merges into it, and the member\'s own settings stand — a private stack stays private', async () => {
    mockLookup = { data: [{ id: 'stack-mine', is_private: true, is_ranked: true, description: 'Mine.' }], error: null };
    await importArchiveJSON(archive({ createdAt: '2020-01-01T00:00:00Z' }), 'member-1');
    const [row] = listWrites();
    expect(row).toEqual(expect.objectContaining({
      id: 'stack-mine', is_private: true, is_ranked: true, description: 'Mine.',
    }));
    // When they made it is theirs too.
    expect(row).not.toHaveProperty('created_at');
  });

  it('with none, makes one as the file describes it', async () => {
    mockLookup = { data: [], error: null };
    await importArchiveJSON(archive({ isPrivate: true }), 'member-1');
    const [row] = listWrites();
    expect(row.id).not.toBe('stack-mine');
    expect(row).toEqual(expect.objectContaining({ title: 'Silents', is_private: true, description: 'From the file.' }));
  });
});
