/**
 * aRecordKeptForSendingLeavesNoDraft.test.tsx — the log sheet's draft at the seal (P4.14).
 *
 * The record is kept on the phone before it is sent. From that moment it is the queue's: an app
 * ended mid-send (killed_mid_write) reopened the sheet with the draft, ready to be sealed a second
 * time. So the draft goes when the record is kept, and comes back if the seal is refused, from
 * what the form still holds.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { writeDraft, clearDraft, readDraft } from '@/src/utils/memberDrafts';

const ME = '44444444-4444-4444-8444-444444444444';
const DRAFT = { filmId: 603, filmTitle: 'The Matrix', review: 'Still the best.', rating: 4 };

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  clearDraft(ME, 'log');
});

it('the draft goes the moment the record is kept for sending, before the send is answered', async () => {
  let draftAtKeep: unknown = 'not asked';
  let send!: () => void;
  const addLog = jest.fn((_log: unknown, opts?: { onKeptAhead?: () => void }) => {
    opts?.onKeptAhead?.();
    draftAtKeep = readDraft(ME, 'log');
    return new Promise<void>((done) => { send = done; });
  });
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  writeDraft(ME, 'log', DRAFT);
  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(603));
  let sealing!: Promise<void>;
  await act(async () => { sealing = result.current.handleLog(); });
  // Kept, and the send still out: an app ended now has nothing to seal twice.
  expect([draftAtKeep, readDraft(ME, 'log')]).toEqual([null, null]);
  await act(async () => { send(); await sealing; });
});

it('a seal refused puts the words back on the phone, as the form still holds them', async () => {
  const refused = Object.assign(new Error('permission denied for table logs'), { code: '42501' });
  const addLog = jest.fn(async (_log: unknown, opts?: { onKeptAhead?: () => void }) => { opts?.onKeptAhead?.(); throw refused; });
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  writeDraft(ME, 'log', DRAFT);
  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(603));
  await act(async () => { await result.current.handleLog(); });
  expect(readDraft<typeof DRAFT>(ME, 'log')?.data).toEqual(expect.objectContaining({ filmId: 603, review: 'Still the best.', rating: 4 }));
});
