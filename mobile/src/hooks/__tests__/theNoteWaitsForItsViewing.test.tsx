/**
 * A log cached before viewings had names — the first launch after this update.
 *
 * Found in the post-ship check of Phase 2: such a log does not know which
 * viewing it is on, so the Vault could not say which note was its current one.
 * The form opened EMPTY over a note that existed, and anything typed there had no
 * viewing to be saved against.
 *
 * Run here, not read: the form asks the server for the viewing and stays shut
 * until it has it.
 */
import { renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { supabase } from '@/src/lib/supabase';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { useVaultStore } from '@/src/stores/vaultStore';

// jest hoists this above the imports; `mock`-prefixed names may be captured.
const mockFetchNotes = jest.fn();
jest.mock('@/src/services/VaultService', () => {
  const real = jest.requireActual('@/src/services/VaultService');
  return {
    ...real,
    VaultService: { ...real.VaultService, fetchNotesForLog: (...a: unknown[]) => mockFetchNotes(...a) },
  };
});

const ME = '33333333-3333-4333-8333-333333333333';
const LOG = '44444444-4444-4444-8444-444444444444';
const V_NOW = '55555555-5555-4555-8555-555555555555';

/** A log exactly as a pre-update cache holds it: no `viewingId` at all. */
const staleLog = {
  id: LOG, filmId: 603, title: 'The Matrix', rating: 0, review: '', status: 'watched',
  watchedDate: '2026-09-01', viewCount: 1, viewingHistory: [],
};

/** What the server answers when asked which viewing the log is on. */
function serverKnowsViewing(viewingId: string | null) {
  (supabase.from as jest.Mock).mockImplementation(() => {
    const c: Record<string, jest.Mock> = {};
    const self = () => c;
    for (const m of ['select', 'eq', 'order', 'limit', 'delete', 'update', 'insert']) c[m] = jest.fn(self);
    c.maybeSingle = jest.fn().mockResolvedValue({ data: viewingId ? { viewing_id: viewingId } : null, error: null });
    (c as any).then = (cb: (v: unknown) => unknown) => Promise.resolve(cb({ data: [], error: null }));
    return c;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  useVaultStore.getState().clear();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  useFilmStore.setState({ logs: [staleLog] as never, _loggedIndex: { 603: staleLog } as never });
  (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: LOG, filmId: '603', filmTitle: 'The Matrix' });
  mockFetchNotes.mockResolvedValue([{ viewing_id: V_NOW, log_id: LOG, notes: 'about that night' }]);
});

describe('the form, over a log that does not know its viewing', () => {
  it('stays shut until the viewing is known — then shows the real note', async () => {
    serverKnowsViewing(V_NOW);
    const { result } = await renderHook(() => useLogFlow());
    await waitFor(() => expect(result.current.noteReady).toBe(true));
    // Not an empty box over a note that exists.
    expect(result.current.privateNotes).toBe('about that night');
  });

  it('writes the name it learned back, so the save has a viewing to use', async () => {
    serverKnowsViewing(V_NOW);
    const { result } = await renderHook(() => useLogFlow());
    await waitFor(() => expect(result.current.noteReady).toBe(true));
    expect(useFilmStore.getState().logs.find(l => l.id === LOG)?.viewingId).toBe(V_NOW);
  });

  it('when the viewing cannot be learned, the field stays shut and says why', async () => {
    serverKnowsViewing(null);
    const { result } = await renderHook(() => useLogFlow());
    await waitFor(() => expect(result.current.noteUnreachable).toBe(true));
    expect(result.current.noteReady).toBe(false);
  });
});
