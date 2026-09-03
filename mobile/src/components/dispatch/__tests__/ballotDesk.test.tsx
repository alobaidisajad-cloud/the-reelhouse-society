/**
 * ballotDesk.test.tsx — putting a question to the house.
 * ─────────────────────────────────────────────────────────────────────────────
 * The ballot desk and the film picker were 74 never-executed statements, and
 * two defects were living in them:
 *
 *   THE SAME FILM COULD STAND TWICE. Nothing stopped it, and `ballot_options`
 *   only counts the options — so the database would have accepted a ballot
 *   whose vote was split between two copies of one film, producing a result
 *   that means nothing.
 *
 *   THE PICKER RESOLVED A FILM BY TITLE AND YEAR. `results.find(...)` returns
 *   the FIRST match, so two entries sharing both — a re-release, a duplicate
 *   TMDB record — handed back the wrong id, and the wrong film was persisted as
 *   the filing's subject. Correct-looking and wrong.
 *
 * Both are the same mistake at different layers: identifying a row by its
 * content instead of its position.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { ComposeBallotScreen, FilmPicker } from '@/src/components/dispatch/ComposeDesks';

let mockResults: Array<Record<string, unknown>> = [];
const mockFiled: Array<Record<string, unknown>> = [];
const mockToast = { error: jest.fn(), success: jest.fn() };

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
    }),
  },
}));

jest.mock('@/src/lib/tmdb', () => ({
  tmdb: { search: async () => ({ results: mockResults }) },
}));

jest.mock('@/src/utils/reelToast', () => {
  const fn = Object.assign(jest.fn(), {
    error: (...a: unknown[]) => mockToast.error(...a),
    success: (...a: unknown[]) => mockToast.success(...a),
  });
  return { __esModule: true, default: fn };
});

const type = async (field: unknown, text: string) => {
  await act(async () => { fireEvent.changeText(field as never, text); });
};
const press = async (control: unknown) => {
  await act(async () => { fireEvent.press(control as never); });
};

/** Search, wait out the debounce, and let the results land. */
const search = async (getByLabelText: (m: string) => unknown, q: string) => {
  await type(getByLabelText('Search for a film'), q);
  await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
};

const tmdbFilm = (id: number, title: string, year: string) => ({
  id, title, release_date: year + '-01-01', media_type: 'movie', poster_path: '/p.jpg',
});

beforeEach(() => {
  mockResults = []; mockFiled.length = 0;
  mockToast.error.mockClear(); mockToast.success.mockClear();
  jest.useFakeTimers({ doNotFake: ['nextTick'] });
});
afterEach(() => { jest.useRealTimers(); });

describe('the film picker', () => {
  it('resolves the SECOND of two identical-looking films', async () => {
    mockResults = [tmdbFilm(1, 'Suspiria', '1977'), tmdbFilm(2, 'Suspiria', '1977')];
    const picked: number[] = [];
    const { getAllByLabelText, getByLabelText } = render(
      <FilmPicker visible onClose={() => {}} bottomInset={0}
        onPick={(_f, id) => picked.push(id)} />,
    );

    await search(getByLabelText as never, 'suspiria');
    const rows = getAllByLabelText('Suspiria, 1977');
    expect(rows).toHaveLength(2);

    await press(rows[1]);
    expect(picked).toEqual([2]);
  });

  it('asks for nothing until there is something to search for', async () => {
    const { getByLabelText, queryByLabelText } = render(
      <FilmPicker visible onClose={() => {}} bottomInset={0} onPick={() => {}} />,
    );
    mockResults = [tmdbFilm(1, 'Tokyo Story', '1953')];
    await search(getByLabelText as never, 'a');
    expect(queryByLabelText(/Tokyo Story/)).toBeNull();
  });

  it('leaves people out of a film search', async () => {
    mockResults = [
      { id: 9, name: 'Yasujiro Ozu', media_type: 'person' },
      tmdbFilm(1, 'Tokyo Story', '1953'),
    ];
    const { getByLabelText, queryByLabelText } = render(
      <FilmPicker visible onClose={() => {}} bottomInset={0} onPick={() => {}} />,
    );
    await search(getByLabelText as never, 'ozu');
    expect(queryByLabelText(/Yasujiro/)).toBeNull();
    expect(getByLabelText('Tokyo Story, 1953')).toBeTruthy();
  });

  it('closes from the ground behind it', async () => {
    let closed = false;
    const { getByLabelText } = render(
      <FilmPicker visible onClose={() => { closed = true; }} bottomInset={0} onPick={() => {}} />,
    );
    await press(getByLabelText('Close, without naming a film'));
    expect(closed).toBe(true);
  });
});

describe('the ballot desk', () => {
  const fill = async (
    getByLabelText: (m: string | RegExp) => unknown,
    slot: number, film: ReturnType<typeof tmdbFilm>,
  ) => {
    await press(getByLabelText('Choose film ' + slot));
    mockResults = [film];
    await search(getByLabelText as never, film.title);
    await press(getByLabelText(`${film.title}, ${film.release_date.slice(0, 4)}`));
  };

  it('refuses to put the same film on the ballot twice', async () => {
    const { getByLabelText } = render(<ComposeBallotScreen />);
    const tokyo = tmdbFilm(1, 'Tokyo Story', '1953');

    await fill(getByLabelText as never, 1, tokyo);
    await fill(getByLabelText as never, 2, tokyo);

    // A ballot that splits its own vote between two copies of one film produces
    // a result that means nothing, and the database would have accepted it.
    expect(mockToast.error).toHaveBeenCalledWith('That film is already on this ballot.');
  });

  it('will not open until there is a question and two films', async () => {
    const { getByLabelText } = render(<ComposeBallotScreen />);
    expect(getByLabelText(/File it. Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await type(getByLabelText('Your question'), 'What should the house watch?');
    await fill(getByLabelText as never, 1, tmdbFilm(1, 'Tokyo Story', '1953'));
    expect(getByLabelText(/File it. Not ready yet/).props.accessibilityState.disabled).toBe(true);

    await fill(getByLabelText as never, 2, tmdbFilm(2, 'Late Spring', '1949'));
    expect(getByLabelText('File it').props.accessibilityState.disabled).toBe(false);
  });

  it('files the question as both the title and the body', async () => {
    const { getByLabelText } = render(<ComposeBallotScreen />);
    await type(getByLabelText('Your question'), 'What tonight?');
    await fill(getByLabelText as never, 1, tmdbFilm(1, 'Tokyo Story', '1953'));
    await fill(getByLabelText as never, 2, tmdbFilm(2, 'Late Spring', '1949'));
    await press(getByLabelText('File it'));
    await act(async () => { await Promise.resolve(); });

    const filed = mockFiled[0];
    // `published_has_body` requires a body, and what a ballot SAYS is its
    // question — a title with an empty body is a row the database refuses.
    expect(filed.title).toBe('What tonight?');
    expect(filed.body).toBe('What tonight?');
    expect((filed.options as unknown[]).map((o) => (o as { film_id: number }).film_id)).toEqual([1, 2]);
    expect(filed.closesAt).toBeTruthy();
  });

  it('turns the three closing choices into three real dates', async () => {
    const { getByLabelText } = render(<ComposeBallotScreen />);
    await type(getByLabelText('Your question'), 'What tonight?');
    await fill(getByLabelText as never, 1, tmdbFilm(1, 'Tokyo Story', '1953'));
    await fill(getByLabelText as never, 2, tmdbFilm(2, 'Late Spring', '1949'));

    await press(getByLabelText('Closes in 1 week'));
    await press(getByLabelText('File it'));
    await act(async () => { await Promise.resolve(); });

    const days = (new Date(mockFiled[0].closesAt as string).getTime() - Date.now()) / 86_400_000;
    expect(Math.round(days)).toBe(7);
  });

  it('takes a film back off a slot', async () => {
    const { getByLabelText, queryByLabelText } = render(<ComposeBallotScreen />);
    await fill(getByLabelText as never, 1, tmdbFilm(1, 'Tokyo Story', '1953'));
    expect(queryByLabelText(/Remove Tokyo Story/i)).toBeTruthy();
    await press(getByLabelText(/Remove Tokyo Story/i));
    expect(queryByLabelText(/Remove Tokyo Story/i)).toBeNull();
  });
});
