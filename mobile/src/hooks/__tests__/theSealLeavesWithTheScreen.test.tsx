/**
 * THE SEAL LEAVES WITH THE SCREEN — the log screen's ending, EXECUTED.
 *
 * A filed record holds "RECORD SEALED" for one brass beat (650ms), then the
 * screen dismisses itself once the phone is idle, and — for a new record —
 * asks for a store review after the dismissal has finished. Batch 22 found the
 * ending wrong three ways: a bare timer that popped whatever screen the member
 * had moved on to; deferred work that did the same after the timer was fixed;
 * and a fix for THAT which cancelled the review prompt it was meant to precede.
 * And a failure said the wrong thing, or said it twice.
 *
 * logScreenPolish.guard pinned these by pattern-matching the hook's source.
 * This drives the real hook: the phone's idle queue is held in the test's hand,
 * so "the member left before it ran" is something that actually happens here.
 */
import React from 'react';
import { InteractionManager } from 'react-native';
import { render, act } from '@testing-library/react-native';

import { useLogFlow } from '../useLogFlow';
import reelToast from '@/src/utils/reelToast';
import { maybeRequestReview } from '@/src/utils/requestReview';
import { LOG_BUSY } from '@/src/stores/domain/logSlice/helpers/logOperations';

const mockBack = jest.fn();
let mockAddLog: jest.Mock;
let mockUpdateLog: jest.Mock;
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() }),
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
}));
// Read as a hook by the screen and with getState() by the note vault an edit opens.
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'u1', username: 'cinephile', tier: 'auteur' }, isAuthenticated: true };
  return { useAuthStore: Object.assign(() => state, { getState: () => state }) };
});
// One stable object: a fresh one per render loops the hook's reset effect.
jest.mock('@/src/stores/films', () => {
  const state = {
    logs: [{ id: 'log-9', filmId: 550, title: 'Fight Club', rating: 8, status: 'watched' }],
    lists: [], _loggedIndex: {},
    addLog: (...a: unknown[]) => mockAddLog(...a),
    updateLog: (...a: unknown[]) => mockUpdateLog(...a),
    removeLog: jest.fn(), addFilmToList: jest.fn(), removeFilmFromList: jest.fn(),
  };
  return { useFilmStore: () => state };
});
jest.mock('@/src/lib/sentry', () => ({ captureError: jest.fn() }));
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { poster: () => 'https://x/p.jpg', movieImages: jest.fn().mockResolvedValue({ posters: [] }), movie: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@/src/utils/requestReview', () => ({ maybeRequestReview: jest.fn() }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = jest.fn();
  Object.assign(fn, { error: jest.fn(), success: jest.fn(), info: jest.fn() });
  return { __esModule: true, default: fn };
});

/** The phone's idle queue, in the test's hand: nothing runs until `idle()`. */
let queue: { fn: () => void; cancelled: boolean }[] = [];
const idle = async () => {
  while (queue.length) {
    const next = queue.shift()!;
    if (!next.cancelled) await act(async () => { next.fn(); });
  }
};

let api: ReturnType<typeof useLogFlow> | null = null;
function Probe() { api = useLogFlow(); return null; }

const file = async () => {
  const r = render(<Probe />);
  await act(async () => { api!.setRating(8); });
  await act(async () => { await api!.handleLog(); });
  return r;
};
const beat = async () => { await act(async () => { jest.advanceTimersByTime(650); }); };
const errors = () => (reelToast as unknown as { error: jest.Mock }).error.mock.calls.map(([m]) => m);

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  api = null;
  queue = [];
  mockParams = { filmId: '550', filmTitle: 'Fight Club', filmPoster: '/p.jpg', filmYear: '1999' };
  mockAddLog = jest.fn().mockResolvedValue(undefined);
  mockUpdateLog = jest.fn().mockResolvedValue(undefined);
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(((fn: () => void) => {
    const task = { fn, cancelled: false };
    queue.push(task);
    return { cancel: () => { task.cancelled = true; }, then: jest.fn(), done: jest.fn() };
  }) as never);
});
afterEach(() => { jest.clearAllTimers(); jest.useRealTimers(); });

describe('a filed record, when the member stays', () => {
  it('holds the seal for a beat, dismisses once idle, then asks for a review — in that order', async () => {
    await file();
    expect(api!.sealed).toBe(true);
    expect(mockBack).not.toHaveBeenCalled();
    await beat();
    expect(mockBack).not.toHaveBeenCalled(); // waits for the phone to be idle
    await idle();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(maybeRequestReview).toHaveBeenCalledWith(2); // the archive held one; this is the second
  });

  it('an edit dismisses too, but asks for no review — it added no film', async () => {
    mockParams = { editLogId: 'log-9', filmId: '550', filmTitle: 'Fight Club' };
    await file();
    await beat();
    await idle();
    expect(mockUpdateLog).toHaveBeenCalled();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(maybeRequestReview).not.toHaveBeenCalled();
  });
});

describe('a filed record, when the member has already left', () => {
  it('during the beat: nothing is dismissed and nothing is asked', async () => {
    const r = await file();
    r.unmount();
    await beat();
    await idle();
    expect(mockBack).not.toHaveBeenCalled();
    expect(maybeRequestReview).not.toHaveBeenCalled();
  });

  it('after the beat, before the phone was idle: the queued dismissal is called off', async () => {
    const r = await file();
    await beat();
    r.unmount();
    await idle();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('once dismissed, the review prompt still comes — the dismissal must not cancel it', async () => {
    const r = await file();
    await beat();
    // The dismissal runs; it is what takes the screen away, and it queues the prompt.
    const dismissal = queue.shift()!;
    await act(async () => { dismissal.fn(); });
    r.unmount();
    await idle();
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(maybeRequestReview).toHaveBeenCalledTimes(1);
  });
});

describe('a record that did not file says one true thing', () => {
  it('"still saving" when the store is busy — told apart by its code', async () => {
    mockAddLog.mockRejectedValue(Object.assign(new Error('addLog mutex locked'), { code: LOG_BUSY }));
    await file();
    expect(errors()).toEqual(['Still sealing the previous record — one moment.']);
  });

  it('"could not be sealed" for any other failure — once', async () => {
    mockAddLog.mockRejectedValue(new Error('permission denied'));
    await file();
    expect(errors()).toEqual(['The record could not be sealed. Try again.']);
    expect(api!.sealed).toBe(false);
    await beat();
    await idle();
    expect(mockBack).not.toHaveBeenCalled();
  });
});
