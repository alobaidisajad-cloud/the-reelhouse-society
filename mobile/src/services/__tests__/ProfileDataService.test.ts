/**
 * ProfileDataService — column-level privacy, asserted against the REAL sets.
 *
 * The previous version re-declared the column lists locally and checked its own
 * copies, so the actual query could have started leaking `preferences` and this
 * suite would still have passed. That is the wrong way round for a privacy
 * control: the point is to catch the day someone widens the public select.
 *
 * The constants are now exported and asserted directly, and fetchProfile is
 * driven so the set it ACTUALLY sends is observed rather than assumed.
 */
import { ProfileDataService, SELF_PROFILE_COLUMNS, PUBLIC_PROFILE_COLUMNS } from '../ProfileDataService';
import { supabase } from '@/src/lib/supabase';

jest.mock('@/src/lib/supabase', () => ({ supabase: { from: jest.fn() } }));
jest.mock('@/src/utils/logger', () => ({
  logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/utils/withAbortSignal', () => ({ withAbortSignal: (q: unknown) => q }));

/** Captures the exact column string handed to .select(). */
let selected: string | undefined;
const mockChain = (data: unknown) => {
  const chain = {
    select: jest.fn((cols: string) => { selected = cols; return chain; }),
    eq: jest.fn(() => chain),
    maybeSingle: jest.fn(() => Promise.resolve({ data, error: null })),
  };
  return chain;
};

beforeEach(() => { jest.clearAllMocks(); selected = undefined; });

/** Fields that must never leave the server for someone else's profile. */
const PRIVATE_FIELDS = ['email', 'is_banned', 'push_token', 'stripe', 'apple_id', 'phone'];

describe('column sets — the privacy boundary itself', () => {
  it('the PUBLIC set never selects the raw preferences blob', () => {
    // preferences carries private settings. The public set reads `public_prefs`,
    // the database-side whitelist projection — that is the exact leak this
    // boundary exists to prevent.
    const cols = PUBLIC_PROFILE_COLUMNS.split(',').map(c => c.trim());
    expect(cols).not.toContain('preferences');
    expect(cols).toContain('public_prefs');
  });

  it('the PUBLIC set never reaches INTO preferences with a JSONB path', () => {
    // A `preferences->key` path still requires column-level SELECT on
    // `preferences`, so it keeps the raw settings blob readable by anyone the
    // column is granted to — including logged-out visitors. The projection must
    // happen in the database, never in this string.
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain('preferences->');
  });

  it('the SELF set may take preferences whole — it is the member’s own data', () => {
    expect(SELF_PROFILE_COLUMNS.split(',').map(c => c.trim())).toContain('preferences');
  });

  it('NEITHER set selects a sensitive account field', () => {
    for (const field of PRIVATE_FIELDS) {
      expect(PUBLIC_PROFILE_COLUMNS).not.toContain(field);
      expect(SELF_PROFILE_COLUMNS).not.toContain(field);
    }
  });

  it('the public set is not accidentally wider than the self set', () => {
    // Any bare column public can read, self must be able to read too. A public
    // column absent from self means someone widened the wrong list.
    //
    // `public_prefs` is the one sanctioned exception: it is the whitelist
    // projection OF `preferences`, which the self set already reads whole. It is
    // strictly narrower than what self gets, not wider.
    const bare = (s: string) => s.split(',').map(c => c.trim()).filter(c => !c.includes(':'));
    const selfCols = bare(SELF_PROFILE_COLUMNS);
    expect(selfCols).toContain('preferences');
    for (const col of bare(PUBLIC_PROFILE_COLUMNS)) {
      if (col === 'public_prefs') continue;
      expect(selfCols).toContain(col);
    }
  });
});

describe('fetchProfile — the set it actually sends', () => {
  it('sends the PUBLIC set for someone else', async () => {
    (supabase.from as jest.Mock).mockReturnValue(mockChain(null));
    await ProfileDataService.fetchProfile('someone', false);
    expect(selected).toBe(PUBLIC_PROFILE_COLUMNS);
  });

  it('sends the SELF set for the member’s own profile', async () => {
    (supabase.from as jest.Mock).mockReturnValue(mockChain(null));
    await ProfileDataService.fetchProfile('me', true);
    expect(selected).toBe(SELF_PROFILE_COLUMNS);
  });

  it('a missing profile is null, not an error', async () => {
    (supabase.from as jest.Mock).mockReturnValue(mockChain(null));
    await expect(ProfileDataService.fetchProfile('ghost', false)).resolves.toBeNull();
  });

  it('queries the profiles table by username', async () => {
    const chain = mockChain(null);
    (supabase.from as jest.Mock).mockReturnValue(chain);
    await ProfileDataService.fetchProfile('someone', false);
    expect(supabase.from).toHaveBeenCalledWith('profiles');
    expect(chain.eq).toHaveBeenCalledWith('username', 'someone');
  });
});

/**
 * A query chain that accepts every builder call and resolves to `data`.
 * fetchOtherUserLists awaits the builder directly, so it must be thenable.
 */
const mockListChain = (data: unknown) => {
  const chain: Record<string, unknown> = {
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res),
  };
  for (const m of ['select', 'eq', 'order', 'limit', 'or']) chain[m] = jest.fn(() => chain);
  return chain;
};

describe('fetchOtherUserLists — one bad item must never erase a whole list', () => {
  const goodItem = { list_id: 'l1', film_id: 42, film_title: 'Solaris', poster_path: '/p.jpg' };
  const row = (list_items: unknown) => ({
    id: 'l1', title: 'My List', description: null,
    is_ranked: true, is_private: false,
    created_at: '2026-01-01T00:00:00Z', list_items,
  });

  const run = async (list_items: unknown) => {
    (supabase.from as jest.Mock).mockReturnValue(mockListChain([row(list_items)]));
    return ProfileDataService.fetchOtherUserLists('u1');
  };

  it('keeps the list and drops only the malformed item', async () => {
    // parseRowsSafely discards a row whose schema fails, so a naive
    // z.array(ListItemRowSchema) would delete this member's list outright.
    const { items } = await run([goodItem, { film_id: 'not-a-film' }, null]);
    expect(items).toHaveLength(1);
    expect(items[0].films).toEqual([{ id: 42, title: 'Solaris', poster: '/p.jpg' }]);
  });

  it('survives list_items being null, absent, or not an array at all', async () => {
    for (const bad of [null, undefined, { oops: true }]) {
      const { items } = await run(bad);
      expect(items).toHaveLength(1);
      expect(items[0].films).toEqual([]);
    }
  });

  it('coerces a film_id that arrives as a string', async () => {
    const { items } = await run([{ ...goodItem, film_id: '42' }]);
    expect(items[0].films[0].id).toBe(42);
  });

  it('a list with no films is still returned, not hidden', async () => {
    const { items } = await run([]);
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('My List');
  });
});
