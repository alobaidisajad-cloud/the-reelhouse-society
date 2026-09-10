/**
 * theDraftIsTheWholePiece.test.tsx — the draft returned the words and lost
 * everything else.
 * ─────────────────────────────────────────────────────────────────────────────
 * It saved `{ title, content }`. A member who picked a film, chose a series and
 * wrote for an hour got the sentences back and nothing else — and the film now
 * carries the essay's COVER, so half a draft loses the picture at the head of
 * the page as well.
 *
 * ── AND THE PART NUMBER IS THE TRAP UNDER THE TRAP ──────────────────────────
 * Storing the series is not enough. `nextPart` is computed when the series is
 * PICKED, not when the essay is filed. Pick "Ozu, in four parts", be offered
 * Part II, write for an hour, be killed. File Part II from somewhere else in
 * the meantime, restore the draft — it still says II, and files a second one.
 * The series page then prints II, II, III in Roman numerals off that field.
 *
 * A stored part number is a fact about the past, so the room asks the present.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import ComposeScreen from '@/app/dispatch/compose';
import { draftKey } from '@/src/utils/memberDrafts';

const mockStore = new Map<string, string>();
const mockParams: Record<string, string> = { kind: 'dossier' };
let mockUser: Record<string, unknown> | null = {
  id: 'u1', username: 'ana', tier: 'auteur', member_no: 17,
};
/** The parts of the series that exist on the server, right now. */
let mockPartsOnServer: number[] = [];

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn(), setParams: jest.fn() },
  useLocalSearchParams: () => mockParams,
  Stack: { Screen: () => null },
  useFocusEffect: jest.fn(),
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: Object.assign(
    (sel?: (s: unknown) => unknown) => {
      const state = { user: mockUser };
      return typeof sel === 'function' ? sel(state) : state;
    },
    { getState: () => ({ user: mockUser }) },
  ),
}));
jest.mock('@/src/stores/mmkv-storage', () => ({
  storage: {
    getString: (k: string) => mockStore.get(k),
    getAllKeys: () => [...mockStore.keys()],
    set: (k: string, v: string) => { mockStore.set(k, v); },
    delete: (k: string) => { mockStore.delete(k); },
  },
}));
jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.not = () => Promise.resolve({
        data: mockPartsOnServer.map((n) => ({
          series_id: 's1', series_title: 'Ozu, in four parts', part_number: n,
        })),
        error: null,
      });
      chain.then = (r: (v: unknown) => unknown) => Promise.resolve({
        data: mockPartsOnServer.map((n) => ({
          series_id: 's1', series_title: 'Ozu, in four parts', part_number: n,
        })),
        error: null,
      }).then(r);
      return chain;
    },
    rpc: () => Promise.resolve({
      data: [{ films: 9, films_needed: 5, days: 9, days_needed: 2, may_file: true }],
      error: null,
    }),
  },
}));
jest.mock('@/src/stores/dispatch', () => ({
  useDispatch: Object.assign(() => ({}), { getState: () => ({ file: jest.fn(), amend: jest.fn() }) }),
}));
jest.mock('@/src/utils/reelToast', () => ({ __esModule: true, default: { error: jest.fn(), success: jest.fn() } }));

const FILM = {
  id: 42, title: 'Tokyo Story', sub: '1953 · OZU',
  image: 'https://x/poster.jpg', backdrop: 'https://x/backdrop.jpg',
};

const seed = (draft: Record<string, unknown>, savedAt = '2026-09-08T21:40:00.000Z') => {
  mockStore.set(draftKey('u1', 'dossier'), JSON.stringify({ v: 2, savedAt, data: draft }));
};

const mount = async () => {
  const r = render(<ComposeScreen />);
  await act(async () => { await new Promise((res) => setTimeout(res, 0)); });
  return r;
};

beforeEach(() => {
  mockStore.clear();
  mockPartsOnServer = [];
  mockUser = { id: 'u1', username: 'ana', tier: 'auteur', member_no: 17 };
});

describe('a restored draft is the whole piece', () => {
  it('gives back the film, with its cover', async () => {
    seed({ title: 'The Long Silence', content: 'An opening.', film: FILM });
    const { getByLabelText } = await mount();

    // The slot names the film it holds.
    expect(getByLabelText(/The film is Tokyo Story/)).toBeTruthy();

    // And the essay's cover travelled with it: the preview draws the head, and
    // the head draws a band only when there is a backdrop.
    const written = JSON.parse(mockStore.get(draftKey('u1', 'dossier'))!);
    expect(written.data.film.backdrop).toBe('https://x/backdrop.jpg');
  });

  it('gives back the series', async () => {
    seed({
      title: 'The Long Silence', content: 'An opening.',
      series: { id: 's1', title: 'Ozu, in four parts', part: 2 },
    });
    mockPartsOnServer = [1];   // Part I filed; II is still free
    const { getByLabelText } = await mount();
    expect(getByLabelText(/Ozu, in four parts/)).toBeTruthy();
  });

  it('THE TRAP: re-derives the part rather than trusting the one it stored', async () => {
    // The draft was offered Part II two days ago. Part II has since been filed.
    seed({
      title: 'The Long Silence', content: 'An opening.',
      series: { id: 's1', title: 'Ozu, in four parts', part: 2 },
    });
    mockPartsOnServer = [1, 2];

    const { getByLabelText, queryByLabelText } = await mount();

    // III, not II — the line that names the part is the one a member reads
    // before filing, and the reader numbers parts off this field.
    expect(getByLabelText(/Part 3 of Ozu/)).toBeTruthy();
    expect(queryByLabelText(/Part 2 of Ozu/)).toBeNull();
  });

  it('leaves the part alone when the series is untouched', async () => {
    seed({
      title: 'x', content: 'y',
      series: { id: 's1', title: 'Ozu, in four parts', part: 2 },
    });
    mockPartsOnServer = [1];
    const { getByLabelText } = await mount();
    expect(getByLabelText(/Part 2 of Ozu/)).toBeTruthy();
  });
});

describe('the room says what it found', () => {
  it('names the day and the hour, without Intl', async () => {
    // 2026-09-08 was a Tuesday. `Intl` is not in Hermes and this app ships no
    // polyfill, so the weekday comes from the app's own table — a
    // `toLocaleString` here would pass every test and throw on a device.
    // Built from a LOCAL date: an ISO string at 21:40 UTC rolls into the next
    // day in any positive-offset zone, so the fixture would name a different
    // weekday depending on where the suite runs.
    seed({ title: 'x', content: 'y' }, new Date(2026, 8, 8, 21, 40).toISOString());
    const { getByText } = await mount();
    expect(getByText(/TAKEN UP WHERE YOU LEFT IT · TUESDAY/)).toBeTruthy();
  });

  it('says nothing at all in an empty room', async () => {
    const { queryByText } = await mount();
    expect(queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
  });

  it('goes on the first keystroke, because typing IS accepting it', async () => {
    seed({ title: 'x', content: 'y' });
    const { getByLabelText, getByText, queryByText } = await mount();
    expect(getByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeTruthy();

    await act(async () => {
      fireEvent.changeText(getByLabelText('Essay content body'), 'y and more');
    });
    expect(queryByText(/TAKEN UP WHERE YOU LEFT IT/)).toBeNull();
  });

  it('START CLEAN empties the room and the key', async () => {
    // Without it a member who wants a fresh essay has to hand-delete four
    // thousand characters.
    seed({ title: 'The Long Silence', content: 'An opening.', film: FILM });
    const { getByLabelText, queryByText } = await mount();

    await act(async () => {
      fireEvent.press(getByLabelText('Start clean, and discard what was here'));
    });

    expect(queryByText('The Long Silence')).toBeNull();
    expect(queryByText('Tokyo Story')).toBeNull();
    expect(mockStore.has(draftKey('u1', 'dossier'))).toBe(false);
  });

  it('says so when what was here could not be read', async () => {
    // The room must not open blank as though nothing was ever written.
    mockStore.set(draftKey('u1', 'dossier'), 'not json at all');
    const { getByText, queryByLabelText } = await mount();
    expect(getByText('WHAT WAS HERE COULD NOT BE READ')).toBeTruthy();
    // And there is nothing to start clean FROM, so no act is offered.
    expect(queryByLabelText('Start clean, and discard what was here')).toBeNull();
  });
});
