/**
 * logSearchEngine.test.tsx — step 0, the room you arrive in.
 *
 * The first half of this page had never been mounted either. It is the shorter
 * half and the more consequential one: everything after it is about a film you
 * have already named, and naming the wrong one is not a defect you notice until
 * the record is sealed.
 */
import React, { act } from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import LogSearchEngine from '../LogSearchEngine';
import { tmdb } from '@/src/lib/tmdb';

jest.mock('lucide-react-native', () => {
  const React = require('react');
  return new Proxy({}, { get: () => (props: any) => React.createElement('Icon', props) });
});
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { View } = require('react-native');
  return {
    FlashList: ({ data, renderItem, keyExtractor }: any) =>
      React.createElement(View, null, (data ?? []).map((item: any, index: number) =>
        React.createElement(React.Fragment, { key: keyExtractor(item, index) }, renderItem({ item, index })))),
  };
});
jest.mock('@/src/lib/tmdb', () => ({
  tmdb: {
    poster: (p: string) => `https://image.tmdb.org/t/p/w92${p}`,
    search: jest.fn(),
  },
}));

const RESULTS = [
  { id: 1, title: 'Chinatown', poster_path: '/a.jpg', release_date: '1974-06-20', vote_average: 8.1 },
  { id: 2, title: 'The Third Man', poster_path: '/b.jpg', release_date: '1949-08-31', vote_average: 8.2 },
  { id: 3, title: 'Nightcrawler', poster_path: '/c.jpg', release_date: '2014-10-23', vote_average: 7.8 },
];

type R = ReturnType<typeof render>;
type Node = { type: string; props: Record<string, any>; children: (Node | string)[] | null };
function walk(r: R): Node[] {
  const out: Node[] = [];
  const visit = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    const node = n as Node;
    out.push(node);
    (node.children ?? []).forEach(visit);
  };
  visit(r.toJSON());
  return out;
}

const search = tmdb.search as jest.Mock;

beforeEach(() => {
  jest.useFakeTimers();
  search.mockReset();
  search.mockResolvedValue({ results: RESULTS, searchType: 'exact', matchedContext: '' });
});
afterEach(() => { jest.useRealTimers(); });

/** Type a query and let the debounce and the request settle. */
async function type(r: R, q: string) {
  await act(async () => { fireEvent.changeText(r.getByLabelText('Search for a film to log'), q); });
  await act(async () => { jest.advanceTimersByTime(400); });
  await act(async () => { await Promise.resolve(); });
}

describe('finding a film', () => {
  it('waits before it asks, so a title is not eight requests', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    const field = r.getByLabelText('Search for a film to log');
    await act(async () => {
      for (const q of ['c', 'ch', 'chi', 'chin']) fireEvent.changeText(field, q);
    });
    expect(search).not.toHaveBeenCalled();
    // Still silent one tick short of the debounce — otherwise "it waits" is
    // satisfied by a delay of zero.
    await act(async () => { jest.advanceTimersByTime(399); });
    expect(search).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(1); });
    expect(search).toHaveBeenCalledTimes(1);
    expect(search).toHaveBeenCalledWith('chin', 1);
  });

  it('shows at most eight, so the room never becomes a catalogue', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({ id: 100 + i, title: `Film ${i}`, release_date: '2000-01-01', vote_average: 5 }));
    search.mockResolvedValue({ results: many, searchType: 'exact', matchedContext: '' });
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'film');
    expect(r.getByText('Film 7')).toBeTruthy();
    expect(r.queryByText('Film 8')).toBeNull();
  });

  it('never offers a person as something to log', async () => {
    // TMDB's multi-search returns people alongside films. A person has no
    // release date and cannot be watched; listing one is a dead row.
    search.mockResolvedValue({
      results: [{ id: 9, name: 'Roman Polanski', media_type: 'person' }, ...RESULTS],
      searchType: 'person', matchedContext: 'roman polanski',
    });
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'polanski');
    expect(r.queryByText('Roman Polanski')).toBeNull();
    expect(r.getByText('Chinatown')).toBeTruthy();
  });

  it('an answer that arrives late never overwrites a newer one', async () => {
    // Type "chin", then keep typing. The first request is slower than the
    // second. Without the generation guard the room fills with the answer to a
    // question that is no longer on screen.
    let resolveSlow: (v: unknown) => void = () => {};
    search
      .mockImplementationOnce(() => new Promise(res => { resolveSlow = res; }))
      .mockResolvedValueOnce({ results: [RESULTS[2]], searchType: 'exact', matchedContext: '' });

    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    const field = r.getByLabelText('Search for a film to log');
    await act(async () => { fireEvent.changeText(field, 'chin'); });
    await act(async () => { jest.advanceTimersByTime(400); });
    await act(async () => { fireEvent.changeText(field, 'nightcrawler'); });
    await act(async () => { jest.advanceTimersByTime(400); });
    await act(async () => { await Promise.resolve(); });
    expect(r.getByText('Nightcrawler')).toBeTruthy();

    // Now the stale one lands.
    await act(async () => { resolveSlow({ results: RESULTS, searchType: 'exact', matchedContext: '' }); });
    await act(async () => { await Promise.resolve(); });
    expect(r.getByText('Nightcrawler')).toBeTruthy();
    expect(r.queryByText('Chinatown')).toBeNull();
  });

  it('says it is working while it works', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await act(async () => { fireEvent.changeText(r.getByLabelText('Search for a film to log'), 'chinatown'); });
    expect(r.getByText('TRANSMITTING QUERY...')).toBeTruthy();
    await type(r, 'chinatown');
    expect(r.queryByText('TRANSMITTING QUERY...')).toBeNull();
  });

  it('lists what it found', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatown');
    for (const f of RESULTS) expect(r.getByText(f.title)).toBeTruthy();
  });

  it('hands back the film that was actually pressed', async () => {
    const onSelectFilm = jest.fn();
    const r = render(<LogSearchEngine onSelectFilm={onSelectFilm} />);
    await type(r, 'chinatown');
    await act(async () => { fireEvent.press(r.getByText('The Third Man')); });
    expect(onSelectFilm).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });
});

describe('no result may steal the tap of the one below it', () => {
  it('a row claims at most half the gap to its neighbour', async () => {
    // The rows sit 8pt apart. PressableScale defaults to 15pt on every side,
    // named or not, so two defaults overlapped by 22pt — and in an overlap the
    // LATER sibling wins on both platforms. The bottom 7pt of every result was
    // pressing the film BELOW it. On this screen that is not a mis-tap you
    // notice: you get a record for a film you did not choose.
    const GAP = 8;
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatown');
    const rows = walk(r)
      .filter(n => typeof n.props?.onStartShouldSetResponder === 'function')
      .map(n => n.props.hitSlop as Record<string, number> | undefined);
    expect(rows).toHaveLength(RESULTS.length);
    for (const s of rows) {
      expect(s).toBeDefined();
      if (!s) continue;
      expect(s.top).toBeLessThanOrEqual(GAP / 2);
      expect(s.bottom).toBeLessThanOrEqual(GAP / 2);
    }
  });
});

describe('when there is nothing to show', () => {
  it('says so, and names what it looked for', async () => {
    search.mockResolvedValue({ results: [], searchType: 'exact', matchedContext: '' });
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'zzzzzz');
    expect(r.getByText(/No films found for "zzzzzz"/)).toBeTruthy();
  });

  it('does not report failure over a query nobody made', async () => {
    // Spaces are not a search — the field is blank as far as anyone is
    // concerned. It must not answer an empty room with "No films found for".
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, '   ');
    expect(search).not.toHaveBeenCalled();
    expect(r.queryByText(/No films found/)).toBeNull();
  });

  it('is silent before anything is typed', () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    expect(r.queryByText(/No films found/)).toBeNull();
    expect(r.queryByText('TRANSMITTING QUERY...')).toBeNull();
  });

  it('clears the results when the field is emptied', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatown');
    expect(r.getByText('Chinatown')).toBeTruthy();
    await act(async () => { fireEvent.changeText(r.getByLabelText('Search for a film to log'), ''); });
    expect(r.queryByText('Chinatown')).toBeNull();
    expect(r.queryByText(/No films found/)).toBeNull();
  });
});

describe('what the search says about itself', () => {
  it('credits a person match rather than pretending it was the title', async () => {
    search.mockResolvedValue({ results: RESULTS, searchType: 'person', matchedContext: 'roman polanski' });
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'polanski');
    expect(r.getByText(/ACTOR\/DIRECTOR MATCH: ROMAN POLANSKI/)).toBeTruthy();
  });

  it('admits when it rescued a typo', async () => {
    search.mockResolvedValue({ results: RESULTS, searchType: 'typo', matchedContext: 'chinatown' });
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatwon');
    expect(r.getByText(/FUZZY RESCUE: CHINATOWN/)).toBeTruthy();
  });

  it('shows no badge when the title simply matched', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatown');
    expect(r.queryByText(/MATCH:/)).toBeNull();
    expect(r.queryByText(/FUZZY RESCUE/)).toBeNull();
  });

  it('a failed request is an empty room, not a crash — and not the last room', async () => {
    const r = render(<LogSearchEngine onSelectFilm={jest.fn()} />);
    await type(r, 'chinatown');
    expect(r.getByText('Chinatown')).toBeTruthy();

    // The next search fails. The previous film must not still be sitting there
    // under a new query — pressing it would log a result of a search that
    // never came back.
    search.mockRejectedValue(new Error('offline'));
    await type(r, 'the third man');
    expect(r.queryByText('Chinatown')).toBeNull();
    expect(r.getByText(/No films found for "the third man"/)).toBeTruthy();
    expect(r.queryByText('TRANSMITTING QUERY...')).toBeNull();
  });
});
