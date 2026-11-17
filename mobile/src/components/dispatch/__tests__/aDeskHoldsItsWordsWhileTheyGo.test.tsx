/**
 * aDeskHoldsItsWordsWhileTheyGo.test.tsx — review round 10 (A1, the short desk)
 * ─────────────────────────────────────────────────────────────────────────────
 * The short desks (take, seeking, wire) keep no draft. While FILE IT was on its way, nothing held
 * the desk: "Discard what you wrote?" stood down for the send, and a swipe or Android's back left at
 * once. A refusal then lost the words, and its "Your words are still here." spoke to a desk already
 * gone. Now every way out is held until the house answers: "Still on its way", with one answer,
 * Wait. Once it has answered, the desk is as it was: a refusal leaves the words, and a leave asks.
 *
 * The navigator's hold is stood in for by one that records each hold the desk sets (by the hook
 * that set it), so a way out meets what the navigator would meet: every hold standing.
 */
import React, { act } from 'react';
import { Alert } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { ComposeShortScreen } from '@/src/components/dispatch/ComposeDesks';

type Leave = (e: { data: { action: { type: string } } }) => void;
/** Each hold the desk sets, by the hook that set it: what it holds now, and what it says. */
const mockHolds = new Map<string, { prevent: boolean; leave: Leave }>();
jest.mock('expo-router/react-navigation', () => ({
  ...require('@/test-utils/navigationMock').navigationMock(),
  usePreventRemove: (prevent: boolean, leave: Leave) => {
    const id = require('react').useId();
    mockHolds.set(id, { prevent, leave });
  },
}));

let mockFile: (d: Record<string, unknown>) => Promise<{ id: string; offline?: boolean } | null> = async () => ({ id: 'new' });
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { user: { id: 'u1', username: 'me', member_no: 7, avatar_url: null } };
      return typeof sel === 'function' ? sel(state) : state;
    },
    { getState: () => ({ user: { id: 'u1', username: 'me' } }) },
  ),
}));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: { getState: () => ({ file: (d: Record<string, unknown>) => mockFile(d), filings: [], opened: {} }) },
}));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});
const mockToast = jest.requireMock('@/src/utils/reelToast').default as { error: jest.Mock };

type Button = { text: string; onPress?: () => void };
let alerts: [string, string | undefined, Button[] | undefined][] = [];

/** A swipe or Android's back, as the navigator meets it: held if any hold stands, each saying its piece. */
const wayOut = () => {
  alerts = [];
  const standing = [...mockHolds.values()].filter((h) => h.prevent);
  for (const h of standing) h.leave({ data: { action: { type: 'GO_BACK' } } });
  return standing.length > 0;
};

/** The house's answer to FILE IT, held until the test gives it. */
function holdTheFiling() {
  let answer: (v: { id: string }) => void = () => {};
  let refuse: (e: Error) => void = () => {};
  mockFile = () => new Promise((res, rej) => { answer = res; refuse = rej; });
  return {
    answer: () => act(async () => { answer({ id: 'new' }); }),
    refuse: () => act(async () => { refuse(new Error('new row violates row-level security policy')); }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockHolds.clear();
  alerts = [];
  jest.spyOn(Alert, 'alert').mockImplementation(((t: string, m?: string, b?: Button[]) => { alerts.push([t, m, b]); }) as never);
});
afterEach(() => { jest.restoreAllMocks(); });

const writeATake = async () => {
  const r = render(<ComposeShortScreen kind="take" />);
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your take'), 'Ozu never once stood up.'); });
  return r;
};

it('a way out while FILE IT is on its way is held: "Still on its way", and only Wait; once filed, nothing holds', async () => {
  const filing = holdTheFiling();
  const r = render(<ComposeShortScreen kind="take" />);
  // Nothing written and nothing on its way: out at once.
  expect(wayOut()).toBe(false);
  await act(async () => { await fireEvent.changeText(r.getByLabelText('Your take'), 'Ozu never once stood up.'); });
  await act(async () => { await fireEvent.press(r.getByLabelText('File it')); });

  expect(wayOut()).toBe(true);
  expect(alerts.map(([t, m, b]) => [t, m, (b ?? []).map((x) => x.text)])).toEqual([
    ['Still on its way', 'The house has not answered yet. One moment.', ['Wait']],
  ]);

  // The house answers: the desk is filed and goes, and nothing holds it.
  await filing.answer();
  expect(wayOut()).toBe(false);
});

it('a filing refused while it was held keeps the words on the desk, and a way out then asks before they go, as before the send', async () => {
  const filing = holdTheFiling();
  const r = await writeATake();
  expect(wayOut()).toBe(true);
  expect(alerts.map(([t]) => t)).toEqual(['Discard what you wrote?']);

  await act(async () => { await fireEvent.press(r.getByLabelText('File it')); });
  expect(wayOut()).toBe(true);
  expect(alerts.map(([t]) => t)).toEqual(['Still on its way']);
  await filing.refuse();

  expect(mockToast.error).toHaveBeenCalledWith('It did not go. Your words are still here.');
  expect(r.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.');
  expect(wayOut()).toBe(true);
  expect(alerts.map(([t]) => t)).toEqual(['Discard what you wrote?']);
});
