/**
 * wireCarriesItsSource.test.tsx — the promise the picker makes.
 * ─────────────────────────────────────────────────────────────────────────────
 * The picker shows five forms, and the wire's line is:
 *
 *     WIRE — News from elsewhere, carrying its source.
 *
 * The desk that opened had no source field. It required a FILM instead, and
 * filed the film's TITLE into `source` — so a wire's provenance, printed on the
 * card as the dateline beside the member's byline, read `TOKYO STORY`.
 *
 * Three separate things all said this was wrong and none of them was checked:
 * the picker's own line, the database's `wire_source` CHECK (which the film
 * title happened to satisfy, which is why nothing failed), and `MAX_LENGTHS`,
 * which has carried a `wireSource: 100` entry that nothing ever wrote.
 *
 * A fourth: the composer PRINTED `SOURCE — ` as the lead-in above the body
 * field, while the card prints `WIRE — ` in that position. The component's own
 * docstring names that exact failure — "the desk promised 'this is how it
 * prints' and then printed something else".
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ComposeShortScreen, ComposeBallotScreen } from '@/src/components/dispatch/ComposeDesks';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

const mockFiled: Array<Record<string, unknown>> = [];

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
      file: async (draft: Record<string, unknown>) => { mockFiled.push(draft); return { id: 'new' }; },
    }),
  },
}));

// `search`, which is what FilmPicker calls — `searchMovies` was a guess, and a
// mock that names a method the code never calls silently provides nothing.
let mockResults: Array<Record<string, unknown>> = [];
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: async () => ({ results: mockResults }) } }));
const mockToast = { error: jest.fn(), success: jest.fn() };
jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToast.error(...a),
    success: (...a: unknown[]) => mockToast.success(...a),
  });
  return { __esModule: true, default: fn };
});

beforeEach(() => {
  mockFiled.length = 0;
  mockResults = [];
  mockToast.error.mockClear(); mockToast.success.mockClear();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); });

/**
 * Typing, flushed.
 *
 * State never settles synchronously in this repo's jest setup — a bare
 * `fireEvent.changeText` leaves the component on its previous render, so
 * `ready` stays false and FILE IT is still announced as "not ready yet". This
 * project has a standing note about it and the first draft of this file broke
 * it in six places.
 */
const type = async (field: unknown, text: string) => {
  await act(async () => { fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { fireEvent.press(control as never); });
};

describe('the wire desk', () => {
  it('asks where it came from, and says the field is required', () => {
    const { getByText, getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByText('SOURCE — REQUIRED')).toBeTruthy();
    expect(getByLabelText('Where this came from')).toBeTruthy();
  });

  it('prints WIRE above the body, which is what the card prints there', () => {
    // `SOURCE — ` sat here, labelling the body field as the source while the
    // real source went in silently as the film's title.
    const { getByText, queryByText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByText('WIRE — ')).toBeTruthy();
    expect(queryByText('SOURCE — ')).toBeNull();
  });

  it('will not file until the source is there', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    await type(getByLabelText('Your wire'), 'Sight & Sound has redone the poll.');

    // Words but no provenance: the database would refuse this row, so the desk
    // refuses it first rather than letting somebody write a wire and be turned
    // down at the end by a rule they were never shown.
    expect(getByLabelText('File it. Not ready yet').props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText('Where this came from'), 'Sight & Sound');
    expect(getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });

  it('files what the member typed, not the film’s title', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    await type(getByLabelText('Your wire'), 'The poll has been redone.');
    await type(getByLabelText('Where this came from'), 'Sight & Sound');
    await press(getByLabelText('File it'));

    expect(mockFiled).toHaveLength(1);
    expect(mockFiled[0].source).toBe('Sight & Sound');
    expect(mockFiled[0].kind).toBe('wire');
  });

  it('caps the source at what the column will take', () => {
    // `source_ceiling` is 100 characters. A field with no cap would let somebody
    // write a hundred and one and be refused by a constraint they cannot see —
    // and the body deliberately has NO cap, for the opposite reason, so the two
    // decisions have to be told apart rather than applied uniformly.
    const { getByLabelText } = render(<ComposeShortScreen kind="wire" />);
    expect(getByLabelText('Where this came from').props.maxLength).toBe(MAX_LENGTHS.wireSource);
    expect(getByLabelText('Your wire').props.maxLength).toBeUndefined();
  });

  it('carries the film as the SUBJECT, and a spoiler when marked', async () => {
    const { getByLabelText } = render(<ComposeShortScreen kind="take" />);
    await type(getByLabelText('Your take'), 'The ending is the whole film.');
    await press(getByLabelText(/Mark a spoiler/i));

    await press(getByLabelText('Name a film'));
    mockResults = [{ id: 42, title: 'Tokyo Story', release_date: '1953-01-01', media_type: 'movie', poster_path: '/p.jpg' }];
    await type(getByLabelText('Search for a film'), 'tokyo');
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
    await press(getByLabelText('Tokyo Story, 1953'));

    await press(getByLabelText('File it'));
    await act(async () => { await Promise.resolve(); });

    expect(mockFiled[0].spoilerLabel).toBe('SPOILERS');
    expect(mockFiled[0].film).toMatchObject({ id: 42, title: 'Tokyo Story', sub: '1953' });
  });

  it('refuses a still until a film is named', async () => {
    // A still belongs to a film. Offering the control before one is named would
    // open a picker with nothing to pick from.
    const { getByLabelText } = render(<ComposeShortScreen kind="take" />);
    await press(getByLabelText(/Add a still/i));
    expect(String(mockToast.error.mock.calls[0][0])).toMatch(/Name a film first/);
  });

  it('does not put the word KEYBOARD on a member’s screen', async () => {
    /**
     * Every desk ended with a 210pt block containing the word KEYBOARD — a
     * DRAWING device, so a mockup shows the composer at its real height. Two of
     * the desks that render it are mounted by the app, so the app shipped it.
     *
     * A contrast sweep found the label at 2.71:1 and I went looking for why a
     * label was that quiet; it was quiet because nobody was ever meant to read
     * it. And a fixed 210pt is not keyboard avoidance either — the keyboard's
     * height is not knowable in advance, so it left the tool rail underneath it.
     */
    for (const kind of ['take', 'seeking', 'wire'] as const) {
      const { queryByText } = render(<ComposeShortScreen kind={kind} />);
      expect(queryByText('KEYBOARD')).toBeNull();
    }
    const ballot = render(<ComposeBallotScreen />);
    expect(ballot.queryByText('KEYBOARD')).toBeNull();
  });

  it('asks a take for no source at all', async () => {
    const { queryByText, getByLabelText } = render(<ComposeShortScreen kind="take" />);
    expect(queryByText('SOURCE — REQUIRED')).toBeNull();
    await type(getByLabelText('Your take'), 'Ozu is the only one who ever sat down.');
    expect(getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });
});
