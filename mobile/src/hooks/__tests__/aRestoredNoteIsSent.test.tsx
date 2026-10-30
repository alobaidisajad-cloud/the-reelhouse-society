/**
 * aRestoredNoteIsSent.test.tsx — a private note restored from a draft is
 * sealed with the record.
 *
 * A note travels only once it has been "touched", so an untouched empty field
 * never clears anything. A draft's note was put back in the field untouched —
 * and the film it brought back reset the touch — so a member who sealed the
 * restored record as it stood lost the note they had written.
 */
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useLogFlow } from '@/src/hooks/useLogFlow';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';
import { writeDraft, clearDraft } from '@/src/utils/memberDrafts';
import { storage } from '@/src/stores/mmkv-storage';

const ME = '33333333-3333-4333-8333-333333333333';

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: ME, username: 'me', tier: 'archivist', role: 'cinephile' } as never });
  (useLocalSearchParams as jest.Mock).mockReturnValue({});
  clearDraft(ME, 'log');
});

it('the note in a restored draft is sent when the record is sealed', async () => {
  const addLog = jest.fn().mockResolvedValue(undefined);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  writeDraft(ME, 'log', { filmId: 603, filmTitle: 'The Matrix', review: 'Still the best.', rating: 4, privateNotes: 'Saw it with Dad.' });

  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(603));
  expect(result.current.privateNotes).toBe('Saw it with Dad.');

  await act(async () => { await result.current.handleLog(); });
  expect(addLog).toHaveBeenCalledWith(expect.objectContaining({ privateNotes: 'Saw it with Dad.' }), { onKeptAhead: expect.any(Function) });
});

it('a log draft as build 41 saved it opens whole, and is sealed as written (savedJsonOpensWhole)', async () => {
  const addLog = jest.fn().mockResolvedValue(undefined);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  const { saved } = require('@/src/utils/__tests__/fixtures/saved-json/drafts.json') as { saved: Record<string, unknown> };
  const [key, envelope] = Object.entries(saved).find(([k]) => k.endsWith('_log'))!;
  const member = key.slice('reelhouse_draft_'.length, -'_log'.length);
  useAuthStore.setState({ user: { id: member, username: 'member', tier: 'archivist', role: 'cinephile' } as never });
  storage.set(key, JSON.stringify(envelope));

  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(19));
  const r = result.current;
  expect([r.film?.title, r.review, r.rating, r.privateNotes]).toEqual(['Metropolis', 'The machine.', 4.5, 'Saw it at the Castro.']);
  await act(async () => { await result.current.handleLog(); });
  expect(addLog).toHaveBeenCalledWith(expect.objectContaining({ review: 'The machine.', rating: 4.5, privateNotes: 'Saw it at the Castro.' }), { onKeptAhead: expect.any(Function) });
  clearDraft(member, 'log');
});

it('a draft with no note still sends none — an untouched empty field clears nothing', async () => {
  const addLog = jest.fn().mockResolvedValue(undefined);
  useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
  writeDraft(ME, 'log', { filmId: 603, filmTitle: 'The Matrix', review: 'Still the best.', rating: 4 });

  const { result } = await renderHook(() => useLogFlow());
  await waitFor(() => expect(result.current.film?.id).toBe(603));
  await act(async () => { await result.current.handleLog(); });
  expect(addLog.mock.calls[0][0]).not.toHaveProperty('privateNotes');
});
