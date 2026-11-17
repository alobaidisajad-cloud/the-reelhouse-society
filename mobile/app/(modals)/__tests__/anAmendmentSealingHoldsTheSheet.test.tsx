/**
 * anAmendmentSealingHoldsTheSheet.test.tsx — review round 10 (A1, the Log sheet)
 * ───────────────────────────────────────────────────────────────────────────────
 * An amendment keeps no draft. Swiped away while it sealed, one the house then refused was lost,
 * its "try again" said to a sheet already gone. Now every way out of the sheet is held while an
 * amendment seals ("Still on its way"); never while nothing seals, and never for a new record,
 * whose draft is kept.
 *
 * Every way out is a removal of the sheet, so each is observed where React Navigation holds it:
 * usePreventRemove (as theLogSheetGoesBackAStep observes the sheet's question). The sheet asks two
 * things of it on each render, its question over amendments and its hold while they seal: each is
 * told by what it says when a way out is taken.
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import { useAuthStore } from '@/src/stores/auth';
import { useFilmStore } from '@/src/stores/films';

jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View } = require('react-native');
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => mockReact.createElement(View, null, children),
    useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
  };
});
jest.mock('expo-router/react-navigation', () => ({
  ...jest.requireActual('expo-router/react-navigation'),
  useScrollToTop: jest.fn(),
  useIsFocused: () => true,
  useNavigation: () => ({ addListener: () => () => {}, setOptions: jest.fn(), navigate: jest.fn(), goBack: jest.fn(), dispatch: jest.fn() }),
  usePreventRemove: jest.fn(),
}));
// The form and its seal bar are their own tests' to draw: here the sheet's flow is kept, so a test
// amends and seals as the member's typing and SEAL would.
type Flow = { setReview: (s: string) => void; handleLog: () => Promise<void>; review: string; submitting: boolean };
let mockFlow: Flow | null = null;
jest.mock('@/src/components/log/LogForm', () => (props: { flow: Flow }) => { mockFlow = props.flow; return null; });
jest.mock('@/src/components/log/LogAtmosphere', () => () => null);
jest.mock('@/src/components/log/LogSealBar', () => ({
  ...jest.requireActual('@/src/components/log/LogSealBar'),
  __esModule: true,
  default: () => null,
}));

const LogSheet = () => { const C = require('@/app/(modals)/log-modal').default; return <C />; };

const ME = '55555555-5555-4555-8555-555555555555';
const LOG_ID = '66666666-6666-4666-8666-666666666666';
const RECORD = { id: LOG_ID, filmId: 550, title: 'The Seventh Seal', rating: 4, review: 'Death plays well.', status: 'watched', watchedDate: '2026-11-01', createdAt: '2026-11-01T20:00:00Z' };
const HOLD = 'Still on its way';

type Button = { text: string; onPress?: () => void };
type Taken = { title: string; message: string; buttons: Button[] };
type Handler = (e: { data: { action: { type: string } } }) => void;
const preventRemove = () => jest.requireMock('expo-router/react-navigation').usePreventRemove as jest.Mock;

/** A way out taken now through one of the sheet's holds: what the member is told, or nothing. */
const takeWayOut = (handler: Handler): Taken | null => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  try {
    handler({ data: { action: { type: 'GO_BACK' } } });
    const said = alert.mock.calls[0];
    if (!said) return null;
    const [title, message, buttons] = said as unknown as [string, string, Button[]];
    return { title, message, buttons };
  } finally {
    alert.mockRestore();
  }
};
/** The latest render's hold that says `title` when taken: whether it holds now, and what it says. */
const holdSaying = (title: string): { holding: unknown; said: Taken } | null => {
  const calls = preventRemove().mock.calls;
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i];
    expect(call).toBeDefined();
    const said = takeWayOut(call![1] as Handler);
    if (said?.title === title) return { holding: call![0], said };
  }
  return null;
};
const flow = () => { expect(mockFlow).not.toBeNull(); return mockFlow!; };

beforeEach(() => {
  preventRemove().mockClear();
  mockFlow = null;
  useAuthStore.setState({ isAuthenticated: true, user: { id: ME, username: 'me', tier: 'free', role: 'cinephile' } as never });
});
afterEach(() => { (useLocalSearchParams as jest.Mock).mockReturnValue({}); });

describe('an amendment', () => {
  let refuse: (e: unknown) => void;
  let updateLog: jest.Mock;
  beforeEach(() => {
    updateLog = jest.fn(() => new Promise((_res, rej) => { refuse = rej; }));
    useFilmStore.setState({ logs: [RECORD], _loggedIndex: { 550: true }, updateLog } as never);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: LOG_ID, filmId: '550', filmTitle: 'The Seventh Seal' });
  });

  it('while it seals, every way out of the sheet stays and says "Still on its way"; a refusal lets it go, the words still there', async () => {
    await render(<LogSheet />);
    await act(async () => { flow().setReview('Death plays well, and cheats.'); });
    // Amended, not sealing: the sheet asks about the amendments, and holds nothing.
    expect(holdSaying(HOLD)?.holding).toBe(false);

    let sealing!: Promise<unknown>;
    await act(async () => { sealing = flow().handleLog(); });
    expect(updateLog).toHaveBeenCalledTimes(1);
    // On its way: CLOSE, a swipe and Android's back are each held, and told to wait.
    const held = holdSaying(HOLD);
    expect(held?.holding).toBe(true);
    expect([held?.said.message, held?.said.buttons.map((b) => b.text)]).toEqual(['The house has not answered yet. One moment.', ['Wait']]);

    // Refused by the house: the sheet is the member's again, and the amendment still in it.
    await act(async () => { refuse(Object.assign(new Error('refused'), { code: 'LOG_REFUSED' })); await sealing.catch(() => {}); });
    expect(holdSaying(HOLD)?.holding).toBe(false);
    expect(flow().review).toBe('Death plays well, and cheats.');
  }, 30_000); // The first render loads the whole sheet.

  // Held while it sealed, the hold stayed once the house took it: the seal's own beat walked back
  // into it, and the sheet never closed (review round 10).
  it('taken by the house, lets the sheet go: the seal\'s beat walks back', async () => {
    let answer!: (v?: unknown) => void;
    const updateLog = jest.fn(() => new Promise((res) => { answer = res; }));
    useFilmStore.setState({ logs: [RECORD], _loggedIndex: { 550: true }, updateLog } as never);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ editLogId: LOG_ID, filmId: '550', filmTitle: 'The Seventh Seal' });
    await render(<LogSheet />);
    await act(async () => { flow().setReview('Death plays well, and cheats.'); });
    let sealing!: Promise<unknown>;
    await act(async () => { sealing = flow().handleLog(); });
    expect(holdSaying(HOLD)?.holding).toBe(true);
    await act(async () => { answer(); await sealing; });
    expect(holdSaying(HOLD)?.holding).toBe(false);
  }, 30_000);
});

describe('a new record', () => {
  it('sealing, is never held: its draft is kept', async () => {
    let answer!: (v?: unknown) => void;
    const addLog = jest.fn(() => new Promise((res) => { answer = res; }));
    useFilmStore.setState({ logs: [], _loggedIndex: {}, addLog } as never);
    (useLocalSearchParams as jest.Mock).mockReturnValue({ filmId: '550', filmTitle: 'The Seventh Seal' });
    await render(<LogSheet />);
    await act(async () => { flow().setReview('Death plays chess.'); });
    let sealing!: Promise<unknown>;
    await act(async () => { sealing = flow().handleLog(); });
    expect(addLog).toHaveBeenCalledTimes(1);
    expect(flow().submitting).toBe(true);
    // The hold is there, and holds nothing.
    const hold = holdSaying(HOLD);
    expect(hold).not.toBeNull();
    expect(hold!.holding).toBe(false);
    await act(async () => { answer(); await sealing; });
    require('@/src/utils/memberDrafts').clearDraft(ME, 'log', '550');
    require('@/src/utils/memberDrafts').clearDraft(ME, 'log');
  });
});
