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
    // preferences carries private settings. The public set may extract named
    // sub-keys (programmes, favorites, hide_stats) but must never take the
    // whole object — that is the exact leak this boundary exists to prevent.
    const cols = PUBLIC_PROFILE_COLUMNS.split(',').map(c => c.trim());
    expect(cols).not.toContain('preferences');
    expect(PUBLIC_PROFILE_COLUMNS).toContain('programmes:preferences->programmes');
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
    const bare = (s: string) => s.split(',').map(c => c.trim()).filter(c => !c.includes(':'));
    for (const col of bare(PUBLIC_PROFILE_COLUMNS)) {
      expect(bare(SELF_PROFILE_COLUMNS)).toContain(col);
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
