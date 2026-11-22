/**
 * anAmendLinkReadsItsFiling.test.tsx — an amend opens on the filing it names, wherever it is held.
 * ─────────────────────────────────────────────────────────────────────────────
 * The short desk took the filing to amend from the reader's pages and the filings opened by
 * address alone. A link to an older one (a cold link, or more than a dozen opened since) found it
 * in neither, opened a blank desk, and filed what was typed as a NEW filing. It is read from the
 * house now; the desk says so until it is in hand, says a read out of reach with a way to ask
 * again, says a filing gone or not the member's, and never files from an amend link.
 */
import React, { act } from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';

import { ComposeShortScreen } from '@/src/components/dispatch/ComposeDesks';

const ID = '0b6f2a8e-3c1d-4e5f-9a7b-1c2d3e4f5a6b';
const mockFiled: Record<string, unknown>[] = [];
const mockAmended: [string, Record<string, unknown>][] = [];
const mockHydrate = jest.fn();

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
  useDispatch: {
    getState: () => ({
      file: async (d: Record<string, unknown>) => { mockFiled.push(d); return { id: 'new' }; },
      amend: async (id: string, d: Record<string, unknown>) => { mockAmended.push([id, d]); return { offline: false }; },
      hydrate: (id: string) => mockHydrate(id),
      // Neither the pages nor the filings opened hold it.
      filings: [],
      opened: {},
    }),
  },
}));
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), dismissTo: jest.fn(), setParams: jest.fn(), canGoBack: () => true },
  useLocalSearchParams: () => ({ edit: ID }),
  Stack: { Screen: () => null },
}));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: async () => ({ results: [] }) } }));
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), { error: jest.fn(), success: jest.fn() });
  return { __esModule: true, default: fn };
});

/** The member's take, as the house holds it. */
const take = (over: Record<string, unknown> = {}) => ({
  id: ID, kind: 'take', authorId: 'u1', author: { name: 'me', memberNo: 7, tier: 'free' },
  film: null, subjectId: null, subjectKind: null, title: null, body: 'Ozu never once stood up.',
  fullContent: null, source: null, sourceUrl: null, options: null, closesAt: null, frozenTotals: null,
  spoilerLabel: null, ...over,
});

const press = async (control: unknown) => {
  await act(async () => { await fireEvent.press(control as never); });
};

beforeEach(() => {
  jest.clearAllMocks();
  mockFiled.length = 0;
  mockAmended.length = 0;
});

describe('an amend link to a filing the reader does not hold', () => {
  it('is read from the house, said while it is read, and opens on the filing as filed', async () => {
    let answer: (v: unknown) => void = () => {};
    mockHydrate.mockReturnValue(new Promise((r) => { answer = r; }));
    const r = render(<ComposeShortScreen kind="take" />);
    expect(r.getByText('READING THE TAKE AS FILED…')).toBeTruthy();
    // Nothing to type into, and nothing to send, until it is in hand.
    expect(r.queryByLabelText('Your take')).toBeNull();
    expect(r.getByLabelText('Amend it. Not ready yet')).toBeTruthy();
    expect(mockHydrate).toHaveBeenCalledWith(ID);

    await act(async () => { answer(take()); });
    expect(r.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.');
    await act(async () => { await fireEvent.changeText(r.getByLabelText('Your take'), 'Ozu never once stood up, and never had to.'); });
    await press(r.getByLabelText('Amend it'));
    expect(mockAmended).toEqual([[ID, expect.objectContaining({ body: 'Ozu never once stood up, and never had to.' })]]);
    expect(mockFiled).toEqual([]);
  });

  it('out of reach, says so, offers it again, and opens when asked again', async () => {
    mockHydrate.mockResolvedValueOnce('unreachable');
    const r = render(<ComposeShortScreen kind="take" />);
    await waitFor(() => expect(r.getByText('THE TAKE COULD NOT BE READ')).toBeTruthy());
    expect(r.queryByLabelText('Your take')).toBeNull();
    expect(r.getByLabelText('Amend it. Not ready yet')).toBeTruthy();

    mockHydrate.mockResolvedValueOnce(take());
    await press(r.getByRole('button', { name: /try again/i }));
    await waitFor(() => expect(r.getByLabelText('Your take').props.value).toBe('Ozu never once stood up.'));
    expect(mockHydrate).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['gone', null],
    ["another member's", take({ authorId: 'u2' })],
    ['of another kind', take({ kind: 'wire', source: 'Sight & Sound' })],
  ])('%s, is said, and nothing is filed or amended', async (_what, got) => {
    mockHydrate.mockResolvedValueOnce(got);
    const r = render(<ComposeShortScreen kind="take" />);
    await waitFor(() => expect(r.getByText('THIS TAKE CAN NO LONGER BE AMENDED')).toBeTruthy());
    expect(r.queryByLabelText('Your take')).toBeNull();
    await press(r.getByLabelText('Amend it. Not ready yet'));
    expect(mockFiled).toEqual([]);
    expect(mockAmended).toEqual([]);
  });
});
