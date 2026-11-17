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
import React, { useEffect } from 'react';
import { InteractionManager } from 'react-native';
import { render, act } from '@testing-library/react-native';

import { useLogFlow } from '../useLogFlow';
import reelToast from '@/src/utils/reelToast';
import { maybeRequestReview } from '@/src/utils/requestReview';
import { LOG_BUSY } from '@/src/stores/domain/logSlice/helpers/logOperations';

const mockBack = jest.fn();
let mockAddLog: jest.Mock;
let mockUpdateLog: jest.Mock;
let mockRemoveLog: jest.Mock;
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  ...require('@/test-utils/expoRouterMock').expoRouterMock(),
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ back: mockBack, push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() }),
  // The app leaves through nav.back(), which asks the router whether there is a back.
  router: { back: () => mockBack(), canGoBack: () => true, push: jest.fn(), replace: jest.fn(), dismiss: jest.fn() },
}));
// Read as a hook by the screen and with getState() by the note vault an edit opens.
jest.mock('@/src/stores/auth', () => {
  const state = { user: { id: 'u1', username: 'cinephile', tier: 'auteur' }, isAuthenticated: true };
  return { useAuthStore: Object.assign(() => state, { getState: () => state }) };
});
// One stable object: a fresh one per render loops the hook's reset effect.
jest.mock('@/src/stores/films', () => {
  const state = {
    logs: [{ id: '00000016-0000-4000-8000-000000000016', filmId: 550, title: 'Fight Club', rating: 8, status: 'watched' }],
    lists: [], _loggedIndex: {},
    addLog: (...a: unknown[]) => mockAddLog(...a),
    updateLog: (...a: unknown[]) => mockUpdateLog(...a),
    removeLog: (...a: unknown[]) => mockRemoveLog(...a), addFilmToList: jest.fn(), removeFilmFromList: jest.fn(),
  };
  // A selector is applied, as Zustand applies it: the editor selects its record.
  return { useFilmStore: (pick?: (s: typeof state) => unknown) => (pick ? pick(state) : state) };
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
// Taken in an effect, which render runs before it returns: never written during render.
function Probe() { const flow = useLogFlow(); useEffect(() => { api = flow; }); return null; }

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
  mockRemoveLog = jest.fn().mockResolvedValue(undefined);
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
    mockParams = { editLogId: '00000016-0000-4000-8000-000000000016', filmId: '550', filmTitle: 'Fight Club' };
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

/**
 * Review round 8: a seal or a removal answered after the sheet was swiped away (or Android's back)
 * set its beat and its walk back after the unmount had cleared everything: nothing cleared them,
 * and the walk back took the member off the page they had gone back to. And a seal and a removal
 * of one record could both be on their way at once, the reseal reaching a record being removed.
 */
const EDITED = '00000016-0000-4000-8000-000000000016';
/** The store's write, held on the wire until the test lets it land. */
const holdOn = (write: jest.Mock) => {
  let land: () => void = () => {};
  write.mockImplementation(() => new Promise<void>((res) => { land = res; }));
  return async () => { await act(async () => { land(); }); };
};

describe('an answer that comes after the sheet has gone', () => {
  it('a seal that lands after the member left walks nobody back, and leaves no beat behind it', async () => {
    // The beat is the seal's one 650 ms timer: set for a sheet that is there, none once it has gone.
    const timers = jest.spyOn(globalThis, 'setTimeout');
    const beatsSet = () => timers.mock.calls.filter(([, ms]) => ms === 650).length;
    const stays = await file();
    expect(beatsSet()).toBe(1);
    stays.unmount();

    const land = holdOn(mockAddLog);
    const r = render(<Probe />);
    await act(async () => { api!.setRating(8); });
    let sealing: Promise<void> | undefined;
    await act(async () => { sealing = api!.handleLog(); });
    r.unmount();
    await land();
    await act(async () => { await sealing; });
    expect(mockAddLog).toHaveBeenCalledTimes(2);
    expect(beatsSet()).toBe(1);
    timers.mockRestore();
    await beat();
    await idle();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('a removal walks back while the sheet is there, and walks nobody back once the member has left', async () => {
    mockParams = { editLogId: EDITED, filmId: '550', filmTitle: 'Fight Club' };
    // Here: removed, and the sheet goes once the phone is idle.
    const stays = render(<Probe />);
    await act(async () => { await api!.handleDelete(true); });
    await idle();
    expect(mockBack).toHaveBeenCalledTimes(1);
    stays.unmount();

    mockBack.mockClear();
    const land = holdOn(mockRemoveLog);
    const leaves = render(<Probe />);
    let removing: Promise<void> | undefined;
    await act(async () => { removing = api!.handleDelete(true); });
    leaves.unmount();
    await land();
    await act(async () => { await removing; });
    expect(mockRemoveLog).toHaveBeenCalledTimes(2);
    await idle();
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('a seal and a removal of one record are never on their way together', () => {
  beforeEach(() => { mockParams = { editLogId: EDITED, filmId: '550', filmTitle: 'Fight Club' }; });

  it('RESEAL while the record is being removed seals nothing', async () => {
    const land = holdOn(mockRemoveLog);
    render(<Probe />);
    let removing: Promise<void> | undefined;
    await act(async () => { removing = api!.handleDelete(true); });
    expect(api!.deleting).toBe(true);
    await act(async () => { await api!.handleLog(); });
    expect(mockUpdateLog).not.toHaveBeenCalled();
    expect(api!.submitting).toBe(false);
    await land();
    await act(async () => { await removing; });
  });

  it('a removal asked while the reseal is on its way removes nothing', async () => {
    const land = holdOn(mockUpdateLog);
    render(<Probe />);
    let sealing: Promise<void> | undefined;
    await act(async () => { sealing = api!.handleLog(); });
    expect(api!.submitting).toBe(true);
    await act(async () => { await api!.handleDelete(true); });
    expect(mockRemoveLog).not.toHaveBeenCalled();
    expect(api!.deleting).toBe(false);
    await land();
    await act(async () => { await sealing; });
    expect(mockUpdateLog).toHaveBeenCalledTimes(1);
  });
});
