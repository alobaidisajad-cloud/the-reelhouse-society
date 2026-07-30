/**
 * undoImport.test.ts — the safety rules for taking an import back.
 *
 * Undo DELETES data, so the bar here is higher than "it works": it must be
 * impossible for it to remove anything the member already owned, anything
 * belonging to another account, or anything at all when the stored receipt is
 * not trustworthy. Those are the cases this file exists for.
 */
import {
  emptyReceipt,
  parseReceipt,
  receiptSize,
  receiptIsEmpty,
  ImportReceipt,
} from '../importReceipt';
import { undoImport, saveReceipt, loadReceipt, clearReceipt } from '../undoImport';
import { supabase } from '@/src/lib/supabase';
import { storage } from '@/src/stores/mmkv-storage';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/stores/mmkv-storage', () => {
  const store = new Map<string, string>();
  return {
    storage: {
      set: jest.fn((k: string, v: string) => store.set(k, v)),
      getString: jest.fn((k: string) => store.get(k)),
      delete: jest.fn((k: string) => store.delete(k)),
      __store: store,
    },
  };
});

const USER = 'user-1';

/** Records every delete the code issues so we can assert on the exact scope. */
interface DeleteCall { table: string; eq: [string, unknown][]; in?: [string, unknown[]] }
let calls: DeleteCall[] = [];

function mockDeletes(rowsPerCall = 1) {
  (supabase.from as jest.Mock).mockImplementation((table: string) => {
    const call: DeleteCall = { table, eq: [] };
    const chain: Record<string, unknown> = {
      delete: () => chain,
      eq: (col: string, val: unknown) => { call.eq.push([col, val]); return chain; },
      in: (col: string, vals: unknown[]) => { call.in = [col, vals]; return chain; },
      select: () => {
        calls.push(call);
        const n = call.in ? Math.min(rowsPerCall * call.in[1].length, call.in[1].length) : rowsPerCall;
        return Promise.resolve({ data: Array.from({ length: n }, (_, i) => ({ id: `r${i}` })), error: null });
      },
    };
    return chain;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  calls = [];
  clearReceipt();
});

// ═══════════════════════════════════════════════════════════════

describe('receipt shape', () => {
  it('a fresh receipt is empty and knows it', () => {
    const r = emptyReceipt(USER, 'letterboxd.zip');
    expect(receiptIsEmpty(r)).toBe(true);
    expect(receiptSize(r)).toBe(0);
    expect(r.v).toBe(1);
    expect(r.userId).toBe(USER);
  });

  it('size counts every kind of row an undo would remove', () => {
    const r = emptyReceipt(USER, 'x');
    r.logIds = ['a', 'b'];
    r.watchlistIds = ['c'];
    r.physicalArchiveIds = ['d'];
    r.listsCreated = ['l1'];
    r.listItemsAdded = [{ listId: 'l2', filmIds: [1, 2, 3] }];
    expect(receiptSize(r)).toBe(8);
    expect(receiptIsEmpty(r)).toBe(false);
  });
});

describe('parseReceipt — an untrusted stored receipt must never reach the delete path', () => {
  const good = (): ImportReceipt => ({
    v: 1, at: '2026-07-30T00:00:00.000Z', userId: USER, sourceLabel: 'x',
    logIds: ['a'], watchlistIds: [], physicalArchiveIds: [], listsCreated: [],
    listItemsAdded: [{ listId: 'l1', filmIds: [550] }],
  });

  it('accepts a well-formed receipt for the right member', () => {
    expect(parseReceipt(good(), USER)).not.toBeNull();
  });

  it('REFUSES a receipt belonging to another account', () => {
    // A receipt surviving a sign-out must never be replayed against whoever
    // signs in next on the same device.
    expect(parseReceipt(good(), 'someone-else')).toBeNull();
  });

  it('refuses an unknown schema version', () => {
    expect(parseReceipt({ ...good(), v: 2 }, USER)).toBeNull();
    expect(parseReceipt({ ...good(), v: undefined }, USER)).toBeNull();
  });

  it('refuses malformed or truncated contents rather than guessing', () => {
    expect(parseReceipt(null, USER)).toBeNull();
    expect(parseReceipt('nonsense', USER)).toBeNull();
    expect(parseReceipt({ ...good(), logIds: 'not-an-array' }, USER)).toBeNull();
    expect(parseReceipt({ ...good(), logIds: [1, 2] }, USER)).toBeNull();
    expect(parseReceipt({ ...good(), listItemsAdded: [{ listId: 'l1' }] }, USER)).toBeNull();
    expect(parseReceipt({ ...good(), listItemsAdded: [{ listId: 'l1', filmIds: ['550'] }] }, USER)).toBeNull();
    expect(parseReceipt({ ...good(), listItemsAdded: 'nope' }, USER)).toBeNull();
  });
});

describe('saveReceipt / loadReceipt', () => {
  it('round-trips a real receipt', () => {
    const r = emptyReceipt(USER, 'letterboxd.zip');
    r.logIds = ['log-1', 'log-2'];
    saveReceipt(r);
    const back = loadReceipt(USER);
    expect(back?.logIds).toEqual(['log-1', 'log-2']);
  });

  it('an import that created NOTHING clears any older receipt', () => {
    const first = emptyReceipt(USER, 'a');
    first.logIds = ['log-1'];
    saveReceipt(first);
    expect(loadReceipt(USER)).not.toBeNull();

    // A second import that added nothing must not leave the FIRST import
    // undoable — the member has had time to build on top of it.
    saveReceipt(emptyReceipt(USER, 'b'));
    expect(loadReceipt(USER)).toBeNull();
  });

  it('offers nothing when signed out, or to a different member', () => {
    const r = emptyReceipt(USER, 'a');
    r.logIds = ['log-1'];
    saveReceipt(r);
    expect(loadReceipt(null)).toBeNull();
    expect(loadReceipt('other-user')).toBeNull();
  });

  it('survives unreadable storage without throwing', () => {
    (storage.getString as jest.Mock).mockReturnValueOnce('{ broken json');
    expect(loadReceipt(USER)).toBeNull();
  });
});

describe('undoImport — scope', () => {
  it('deletes only the films it added to a PRE-EXISTING stack, never the stack', () => {
    // The member's own curation in that stack must survive untouched.
    const r = emptyReceipt(USER, 'x');
    r.listItemsAdded = [{ listId: 'their-stack', filmIds: [550, 680] }];
    mockDeletes();

    return undoImport(r, USER).then(() => {
      const itemDeletes = calls.filter(c => c.table === 'list_items');
      expect(itemDeletes).toHaveLength(1);
      expect(itemDeletes[0].eq).toContainEqual(['list_id', 'their-stack']);
      expect(itemDeletes[0].in).toEqual(['film_id', [550, 680]]);
      // The stack itself is never touched.
      expect(calls.some(c => c.table === 'lists')).toBe(false);
    });
  });

  it('deletes stacks it created outright', async () => {
    const r = emptyReceipt(USER, 'x');
    r.listsCreated = ['made-by-import'];
    mockDeletes();

    await undoImport(r, USER);
    const listDeletes = calls.filter(c => c.table === 'lists');
    expect(listDeletes).toHaveLength(1);
    expect(listDeletes[0].in).toEqual(['id', ['made-by-import']]);
  });

  it('scopes EVERY delete to the member, on top of RLS', async () => {
    const r = emptyReceipt(USER, 'x');
    r.logIds = ['l1'];
    r.watchlistIds = ['w1'];
    r.physicalArchiveIds = ['v1'];
    r.listsCreated = ['s1'];
    mockDeletes();

    await undoImport(r, USER);
    for (const c of calls.filter(c => c.table !== 'list_items')) {
      expect(c.eq).toContainEqual(['user_id', USER]);
    }
  });

  it('removes list items BEFORE the lists that own them', async () => {
    const r = emptyReceipt(USER, 'x');
    r.listItemsAdded = [{ listId: 'a', filmIds: [1] }];
    r.listsCreated = ['b'];
    mockDeletes();

    await undoImport(r, USER);
    const order = calls.map(c => c.table);
    expect(order.indexOf('list_items')).toBeLessThan(order.indexOf('lists'));
  });

  it('REFUSES a receipt from another account and deletes nothing', async () => {
    const r = emptyReceipt('someone-else', 'x');
    r.logIds = ['l1'];
    mockDeletes();

    const res = await undoImport(r, USER);
    expect(res.removed).toBe(0);
    expect(res.errors).toHaveLength(1);
    expect(calls).toHaveLength(0);
  });

  it('touches nothing for an empty receipt', async () => {
    mockDeletes();
    const res = await undoImport(emptyReceipt(USER, 'x'), USER);
    expect(calls).toHaveLength(0);
    expect(res.removed).toBe(0);
    expect(res.errors).toEqual([]);
  });

  it('chunks large id sets instead of one unbounded statement', async () => {
    const r = emptyReceipt(USER, 'x');
    r.logIds = Array.from({ length: 450 }, (_, i) => `log-${i}`);
    mockDeletes();

    await undoImport(r, USER);
    const logDeletes = calls.filter(c => c.table === 'logs');
    expect(logDeletes).toHaveLength(3);              // 200 + 200 + 50
    expect(logDeletes.every(c => (c.in?.[1].length ?? 0) <= 200)).toBe(true);
  });
});

describe('undoImport — failure handling', () => {
  it('keeps going after one table fails, and reports it', async () => {
    (supabase.from as jest.Mock).mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {
        delete: () => chain,
        eq: () => chain,
        in: () => chain,
        select: () => Promise.resolve(
          table === 'logs'
            ? { data: null, error: { message: 'network down' } }
            : { data: [{ id: 'x' }], error: null },
        ),
      };
      return chain;
    });

    const r = emptyReceipt(USER, 'x');
    r.logIds = ['l1'];
    r.watchlistIds = ['w1'];

    const res = await undoImport(r, USER);
    expect(res.errors.some(e => e.includes('network down'))).toBe(true);
    expect(res.removed).toBe(1);   // the watchlist row still went
  });

  it('KEEPS the receipt when anything failed, so the member can retry', async () => {
    const r = emptyReceipt(USER, 'x');
    r.logIds = ['l1'];
    saveReceipt(r);

    (supabase.from as jest.Mock).mockImplementation(() => {
      const chain: Record<string, unknown> = {
        delete: () => chain, eq: () => chain, in: () => chain,
        select: () => Promise.resolve({ data: null, error: { message: 'offline' } }),
      };
      return chain;
    });

    await undoImport(r, USER);
    // Deleting rows that are already gone is a no-op, so a retry is safe —
    // and losing the receipt would strand a half-reversed import forever.
    expect(loadReceipt(USER)).not.toBeNull();
  });

  it('clears the receipt after a clean sweep', async () => {
    const r = emptyReceipt(USER, 'x');
    r.logIds = ['l1'];
    saveReceipt(r);
    mockDeletes();

    const res = await undoImport(r, USER);
    expect(res.errors).toEqual([]);
    expect(loadReceipt(USER)).toBeNull();
  });
});
