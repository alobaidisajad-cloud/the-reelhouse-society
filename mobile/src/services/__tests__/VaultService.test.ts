/**
 * VaultService — the only door between the app and a member's private notes.
 *
 * What is pinned here is the wire: which RPC each act calls, with which named
 * arguments, and that a refusal is RAISED rather than swallowed. supabase-js
 * resolves errors instead of throwing them, so a service that forgot to check
 * would report a refused note as written — and the member would believe it.
 */
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../stores/auth';
import { VaultService, isRankRefusal, RANK_REFUSAL, NOTE_MAX } from '../VaultService';

jest.mock('../../lib/supabase');

const ME = '11111111-1111-4111-8111-111111111111';
const LOG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const V1 = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';

const rpc = () => supabase.rpc as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  (supabase as any).rpc = jest.fn().mockResolvedValue({ data: null, error: null });
  useAuthStore.setState({ user: { id: ME, username: 'me' } as any } as any);
});

describe('reading', () => {
  function stubSelect(result: { data: unknown; error: unknown }) {
    const chain: Record<string, jest.Mock> = {};
    chain.select = jest.fn(() => chain);
    chain.eq = jest.fn(() => chain);
    (chain as any).then = (res: (v: unknown) => unknown) => Promise.resolve(result).then(res);
    (supabase.from as jest.Mock) = jest.fn(() => chain);
    return chain;
  }

  it('asks for one log’s notes, and only the reader’s own', async () => {
    const chain = stubSelect({ data: [{ viewing_id: V1, log_id: LOG, notes: 'mine', updated_at: null }], error: null });
    const rows = await VaultService.fetchNotesForLog(LOG);
    expect(supabase.from).toHaveBeenCalledWith('log_private_notes');
    expect(chain.eq).toHaveBeenCalledWith('log_id', LOG);
    // RLS is the real guard; this makes a mistake show up as an empty answer
    // rather than as somebody else's writing.
    expect(chain.eq).toHaveBeenCalledWith('user_id', ME);
    expect(rows).toEqual([{ viewing_id: V1, log_id: LOG, notes: 'mine', updated_at: null }]);
  });

  it('drops a row that is not a note rather than drawing it', async () => {
    stubSelect({ data: [{ viewing_id: 'not-a-uuid', log_id: LOG, notes: 'x' }, { viewing_id: V1, log_id: LOG, notes: 'kept' }], error: null });
    const rows = await VaultService.fetchNotesForLog(LOG);
    expect(rows.map(r => r.notes)).toEqual(['kept']);
  });

  it('raises a failed read — an unreachable Vault must not look empty', async () => {
    stubSelect({ data: null, error: { message: 'boom' } });
    await expect(VaultService.fetchNotesForLog(LOG)).rejects.toEqual({ message: 'boom' });
  });

  it('asks nothing at all when nobody is signed in', async () => {
    useAuthStore.setState({ user: null } as any);
    (supabase.from as jest.Mock) = jest.fn();
    expect(await VaultService.fetchNotesForLog(LOG)).toEqual([]);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});

describe('writing', () => {
  it('writes a note against its viewing', async () => {
    await VaultService.setNote(LOG, V1, 'a quiet note');
    expect(rpc()).toHaveBeenCalledWith('viewing_note_set', { p_log_id: LOG, p_viewing_id: V1, p_notes: 'a quiet note' });
  });

  it('takes a note back by its viewing', async () => {
    await VaultService.removeNote(V1);
    expect(rpc()).toHaveBeenCalledWith('viewing_note_remove', { p_viewing_id: V1 });
  });

  it('raises the rank refusal instead of reporting the note as written', async () => {
    rpc().mockResolvedValueOnce({ data: null, error: { message: `ERROR: ${RANK_REFUSAL}` } });
    const failure = await VaultService.setNote(LOG, V1, 'x').catch((e) => e);
    expect(isRankRefusal(failure)).toBe(true);
  });

  it('raises a failed removal too', async () => {
    rpc().mockResolvedValueOnce({ data: null, error: { message: 'no' } });
    await expect(VaultService.removeNote(V1)).rejects.toEqual({ message: 'no' });
  });

  it('knows the limit the database enforces', () => {
    expect(NOTE_MAX).toBe(1000);
    expect(isRankRefusal({ message: 'something else' })).toBe(false);
    expect(isRankRefusal(null)).toBe(false);
  });
});

describe('viewings', () => {
  it('a rewatch names the viewing it begins and passes only the fields given', async () => {
    rpc().mockResolvedValueOnce({ data: V1, error: null });
    const id = await VaultService.addViewing(LOG, V1, { rating: 5 });
    expect(rpc()).toHaveBeenCalledWith('log_viewing_add', { p_log_id: LOG, p_viewing_id: V1, p_fields: { rating: 5 } });
    expect(id).toBe(V1);
  });

  it('removing names the viewing being removed', async () => {
    rpc().mockResolvedValueOnce({ data: V1, error: null });
    expect(await VaultService.removeViewing(LOG, V1)).toBe(V1);
    expect(rpc()).toHaveBeenCalledWith('log_viewing_remove', { p_log_id: LOG, p_viewing_id: V1 });
  });

  it('a log that is not yours answers with an error, and it is raised', async () => {
    rpc().mockResolvedValueOnce({ data: null, error: { message: 'Log not found' } });
    await expect(VaultService.addViewing(LOG, V1, {})).rejects.toEqual({ message: 'Log not found' });
    rpc().mockResolvedValueOnce({ data: null, error: { message: 'A log moves to another viewing by adding one or removing one.' } });
    await expect(VaultService.removeViewing(LOG, V1)).rejects.toBeTruthy();
  });

  it('an answer of nothing is nothing, not undefined', async () => {
    rpc().mockResolvedValueOnce({ data: null, error: null });
    expect(await VaultService.removeViewing(LOG, V1)).toBeNull();
    rpc().mockResolvedValueOnce({ data: undefined, error: null });
    expect(await VaultService.addViewing(LOG, V1, {})).toBeNull();
  });
});
