/**
 * aReturnedArchiveKeepsItsNotes.test.ts — the house's own export, brought back.
 *
 * The export keeps a member's private notes apart from the logs, one to a
 * viewing; the import never read them, so every note was lost on the way back.
 * And the logs kept their viewings' identities, which still belong to the
 * original log: a viewing belongs to one log, so the database refused them.
 * A file that was not an archive at all ("null", "{}") crashed or imported as
 * an empty success. And an undo that half-failed kept offering the whole.
 */
import { importArchiveJSON, freshViewings } from '../archiveImport';
import { undoImport } from '../undoImport';
import type { ImportReceipt } from '../importReceipt';

const mockWrites: { table: string; rows: Record<string, unknown>[] }[] = [];
let mockTier = 'archivist';
let mockDeleteFails = new Set<string>();
const mockSaved: string[] = [];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      const chain: any = {};
      for (const m of ['eq', 'order', 'limit', 'range', 'is']) chain[m] = () => chain;
      chain.select = () => chain;
      chain.in = (_col: string, ids: unknown[]) => { chain._ids = ids; return chain; };
      chain.delete = () => { chain._delete = true; return chain; };
      chain.upsert = (rows: Record<string, unknown>[]) => {
        mockWrites.push({ table, rows });
        const answer = { data: rows.map((r) => ({ id: r.id })), error: null };
        return { select: () => Promise.resolve(answer), then: (res: (v: unknown) => unknown) => Promise.resolve(answer).then(res) };
      };
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(
        chain._delete
          ? (mockDeleteFails.has(table)
            ? { data: null, error: { message: 'Network request failed' } }
            : { data: (chain._ids ?? []).map((id: unknown) => ({ id })), error: null })
          : { data: [], error: null },
      ).then(res);
      return chain;
    },
  },
}));
jest.mock('@/src/stores/auth', () => ({ useAuthStore: { getState: () => ({ user: { id: 'member-1', tier: mockTier, role: 'cinephile' } }) } }));
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: { set: (_k: string, v: string) => mockSaved.push(v), delete: jest.fn(), getString: jest.fn() },
}));

const archive = {
  logs: [{
    film_id: 19, film_title: 'Vertigo', viewing_id: 'v-now', private_notes: null,
    viewing_history: [{ viewingId: 'v-then', date: '2020-01-01', rating: 4 }],
  }],
  private_notes: [
    { viewing_id: 'v-now', notes: 'The second time, the tower.' },
    { viewing_id: 'v-then', notes: 'The first time, the hair.' },
  ],
};
const logWrite = () => mockWrites.filter((w) => w.table === 'logs').flatMap((w) => w.rows)[0];
const noteWrites = () => mockWrites.filter((w) => w.table === 'log_private_notes').flatMap((w) => w.rows);

beforeEach(() => { mockWrites.length = 0; mockSaved.length = 0; mockTier = 'archivist'; mockDeleteFails = new Set(); });

describe('the house archive, brought back', () => {
  it('every viewing gets a fresh identity, and each note follows the viewing it was written on', async () => {
    const result = await importArchiveJSON(archive as never, 'member-1');
    expect(result.errors).toEqual([]);
    const log = logWrite();
    const [then] = log.viewing_history as { viewingId: string }[];
    expect(log.viewing_id).not.toBe('v-now');
    expect(then.viewingId).not.toBe('v-then');
    expect(log.private_notes).toBe('The second time, the tower.');
    expect(noteWrites()).toEqual([{ log_id: log.id, viewing_id: then.viewingId, user_id: 'member-1', notes: 'The first time, the hair.' }]);
  });

  it('below the Archivist, an earlier note is discarded, as the database discards the current one', async () => {
    mockTier = 'cinephile';
    const result = await importArchiveJSON(archive as never, 'member-1');
    // The import itself went through: the record is written, only the note is not.
    expect(result.errors).toEqual([]);
    expect(logWrite()).toEqual(expect.objectContaining({ film_id: 19 }));
    expect(noteWrites()).toEqual([]);
  });

  it('a history written as a string is read, and every viewing in it gains a fresh identity', () => {
    const { history, renamed } = freshViewings(JSON.stringify([{ viewingId: 'a' }, { date: '2020-01-01' }]));
    expect(renamed.map(([old]) => old)).toEqual(['a']);
    expect((history as { viewingId: string }[]).every((e) => typeof e.viewingId === 'string' && e.viewingId !== 'a')).toBe(true);
  });

  it.each([[null], [42], [[]], [{}], [{ meta: { version: '2.1' } }]])(
    'a file that is not an archive (%j) is said so, and nothing is written',
    async (file) => {
      await expect(importArchiveJSON(file as never, 'member-1')).rejects.toThrow('This file is not a ReelHouse archive.');
      expect(mockWrites).toEqual([]);
    },
  );
});

describe('an undo that half-failed', () => {
  const receipt: ImportReceipt = {
    v: 1, at: '2026-10-02T00:00:00Z', userId: 'member-1', sourceLabel: 'your archive',
    logIds: ['l1', 'l2'], watchlistIds: ['w1', 'w2', 'w3'], physicalArchiveIds: [], listsCreated: [], listItemsAdded: [],
  };

  it('keeps, and counts, only what it could not remove', async () => {
    mockDeleteFails = new Set(['watchlists']);
    const result = await undoImport(receipt, 'member-1');
    expect(result.removed).toBe(2);
    expect(result.left).toBe(3);
    const kept = JSON.parse(mockSaved[mockSaved.length - 1]) as ImportReceipt;
    expect(kept.logIds).toEqual([]);
    expect(kept.watchlistIds).toEqual(['w1', 'w2', 'w3']);
  });
});
