/**
 * The stamp bar on every card in the Reel, rendered: whose log it is (by id,
 * never by handle), certifying, saving, and a stranger asked for a name at the
 * act. Its Lounge key is tested in theKeyLeadsWhereItSays.test.tsx.
 */
import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';

jest.mock('@/src/stores/auth', () => {
  const { create } = jest.requireActual('zustand');
  return { useAuthStore: create(() => ({ user: null })) };
});
const mockWatch = {
  _endorsedIndex: {} as Record<string, boolean>,
  _watchlistIndex: {} as Record<number, boolean>,
  toggleEndorse: jest.fn(() => Promise.resolve()),
  addToWatchlist: jest.fn(),
  removeFromWatchlist: jest.fn(),
};
jest.mock('@/src/stores/films', () => ({
  useWatchlistStore: (sel: (s: typeof mockWatch) => unknown) => sel(mockWatch),
}));
const mockPush = jest.fn();
jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: (...a: unknown[]) => mockPush(...a) } }));
jest.mock('@/src/utils/TactileEngine', () => ({
  __esModule: true,
  default: { selection: jest.fn(), mutate: jest.fn(), navigate: jest.fn(), destroy: jest.fn(), success: jest.fn(), error: jest.fn() },
}));
jest.mock('@/src/components/ShareToLoungeModal', () => ({ __esModule: true, default: () => null }));

// eslint-disable-next-line import/first
import { ActionDeck } from '../feed/ActionDeck';
// eslint-disable-next-line import/first
import { useAuthStore } from '@/src/stores/auth';

const setUser = (user: Record<string, unknown> | null) =>
  act(() => { (useAuthStore as unknown as { setState: (s: object) => void }).setState({ user }); });
const deck = (over: Partial<React.ComponentProps<typeof ActionDeck>> = {}) => (
  <ActionDeck itemId="log-1" filmId={603} filmTitle="The Matrix" posterPath="/p.jpg" year={1999}
    ownerUsername="old_name" ownerId="u1" {...over} />
);

beforeEach(() => {
  mockPush.mockReset();
  mockWatch.toggleEndorse.mockClear();
  mockWatch.addToWatchlist.mockClear();
  mockWatch.removeFromWatchlist.mockClear();
  mockWatch._endorsedIndex = {};
  mockWatch._watchlistIndex = {};
});

describe('whose log it is', () => {
  it('is decided by id: a member who changed their handle still edits their own log', async () => {
    await setUser({ id: 'u1', username: 'new_name' });
    const r = render(deck());
    expect(r.getByText('EDIT')).toBeTruthy();
    await fireEvent.press(r.getByLabelText('Edit this log'));
    expect(mockPush).toHaveBeenCalledWith('/log-modal', expect.objectContaining({ editLogId: 'log-1', filmId: '603' }));
    expect(mockWatch.addToWatchlist).not.toHaveBeenCalled();
  });

  it('never by handle: the same handle on another member\'s log is still theirs', async () => {
    await setUser({ id: 'u2', username: 'old_name' });
    const r = render(deck());
    expect(r.queryByText('EDIT')).toBeNull();
    expect(r.getByText('SAVE')).toBeTruthy();
  });

  it('and a log that does not say whose it is is nobody\'s to edit', async () => {
    await setUser({ id: 'u1', username: 'old_name' });
    const r = render(deck({ ownerId: null }));
    expect(r.queryByText('EDIT')).toBeNull();
    // The deck is there; only the act that is nobody's is not.
    expect(r.getByLabelText('Save film to your watchlist')).toBeTruthy();
  });
});

describe('the acts', () => {
  it('certifying a log marks it', async () => {
    await setUser({ id: 'u2', username: 'reader' });
    const r = render(deck());
    await fireEvent.press(r.getByLabelText(/certif/i));
    expect(mockWatch.toggleEndorse).toHaveBeenCalledWith('log-1');
  });

  it('saving the film puts it on the watchlist; saved, it takes it off', async () => {
    await setUser({ id: 'u2', username: 'reader' });
    const r = render(deck());
    await fireEvent.press(r.getByLabelText('Save film to your watchlist'));
    expect(mockWatch.addToWatchlist).toHaveBeenCalledWith(expect.objectContaining({ id: 603, title: 'The Matrix' }));
    mockWatch._watchlistIndex = { 603: true };
    const saved = render(deck({ itemId: 'log-2' }));
    expect(saved.getByText('SAVED')).toBeTruthy();
    await fireEvent.press(saved.getByLabelText('Remove film from your watchlist'));
    expect(mockWatch.removeFromWatchlist).toHaveBeenCalledWith(603);
  });

  it('a stranger is asked for a name at the act, and nothing is marked', async () => {
    await setUser(null);
    const r = render(deck());
    // Each act asks on its own: one sign-in for certifying, one for saving.
    await fireEvent.press(r.getByLabelText(/certif/i));
    expect(mockPush.mock.calls).toEqual([['/login']]);
    await fireEvent.press(r.getByLabelText('Save film to your watchlist'));
    expect(mockPush.mock.calls).toEqual([['/login'], ['/login']]);
    expect(mockWatch.toggleEndorse).not.toHaveBeenCalled();
    expect(mockWatch.addToWatchlist).not.toHaveBeenCalled();
  });
});
