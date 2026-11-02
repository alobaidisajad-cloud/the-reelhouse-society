/**
 * aSalonCountsWhatCameAfter.sealed.test.ts — a phone a day ahead still counts
 * the next day's words as unread (WORKLIST P4.32).
 *
 * Opening a salon writes the seat's last_read_at, and the house counts a
 * message unread only when it was written after that. The app wrote the
 * phone's own clock there, so a phone a day ahead hid every message of the
 * next day from its counts. Now the house dates the read itself, whatever the
 * phone sends. Run here as the store runs on the phone, against the sealed
 * copy: the clock a day ahead and the house's not yet heard (the first moments
 * of a launch, and every build in members' hands), the member opens the salon,
 * the other member writes, and the store's own count says 1.
 * db-integration.yml runs it again without the house's trigger, and it must fail.
 */
import { SEALED, SEALED_URL, asMember, canRunSealed, memberClient } from '@/test-utils/sealedEnv';
import { houseFetch } from '@/test-utils/contractEnv';
import { __forgetTheHouse } from '@/src/lib/houseClock';
import { useLoungeStore } from '../lounge';

jest.mock('@/src/lib/supabase', () => {
  const env = jest.requireActual('@/test-utils/sealedEnv');
  return { supabase: env.canRunSealed ? env.memberClient(env.SEALED.readerToken) : {} };
});
jest.mock('../auth', () => ({
  useAuthStore: { getState: () => ({ user: { id: process.env.SEALED_READER_ID, username: 'sealed_reader', role: 'cinephile' } }) },
}));

const DAY = 24 * 60 * 60 * 1000;
const describeMaybe = canRunSealed ? describe : describe.skip;

describeMaybe('a salon read on a phone a day ahead', () => {
  jest.setTimeout(30000);
  const realNow = Date.now.bind(Date);
  beforeAll(() => {
    __forgetTheHouse();
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + DAY);
  });
  afterAll(() => { jest.restoreAllMocks(); });

  it('the seat is read as of the house\'s now, not the phone\'s tomorrow', async () => {
    await useLoungeStore.getState().markRead(SEALED.loungeId);
    const { data, error } = await memberClient(SEALED.readerToken).from('lounge_members')
      .select('last_read_at').eq('lounge_id', SEALED.loungeId).eq('user_id', SEALED.readerId).single();
    expect(error).toBeNull();
    const readAt = Date.parse((data as { last_read_at: string }).last_read_at);
    // Written (not left a week ago), and by the house's clock: within a minute of the real now.
    expect(Math.abs(readAt - realNow())).toBeLessThan(60_000);
  });

  it('the other member\'s next words are counted unread', async () => {
    const res = await houseFetch(`${SEALED_URL}/rest/v1/lounge_messages`, {
      method: 'POST',
      headers: { ...asMember(SEALED.posterToken), Prefer: 'return=minimal' },
      body: JSON.stringify({ lounge_id: SEALED.loungeId, user_id: SEALED.posterId, content: 'Written after the read.', type: 'text' }),
    });
    expect(res.status).toBe(201);
    await useLoungeStore.getState().fetchLounges();
    expect(useLoungeStore.getState().loungesFailed).toBe(false);
    expect(useLoungeStore.getState().lounges.find((l) => l.id === SEALED.loungeId)?.unread_count).toBe(1);
  });
});
