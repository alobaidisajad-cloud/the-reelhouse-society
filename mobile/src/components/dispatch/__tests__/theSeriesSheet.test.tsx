/**
 * theSeriesSheet.test.tsx — the sheet that rejoins a series says what it read.
 *
 * Three faults, each found by reading it: a list that could not be read looked
 * like "none begun" (and a member would begin a second series under the same
 * name); a thirteenth series could not be rejoined; and reopening the sheet kept
 * a half-typed name and drew the old pick for a frame.
 */
import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';

import { SeriesPicker } from '../SeriesPicker';

let mockRows: unknown[] = [];
let mockError: unknown = null;
const mockAsked: { order?: [string, unknown] }[] = [];

jest.mock('@/src/lib/supabase', () => ({
  supabase: {
    from: () => {
      const asked: { order?: [string, unknown] } = {};
      mockAsked.push(asked);
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = () => self();
      chain.eq = () => self();
      chain.not = () => self();
      chain.order = (k: string, o: unknown) => {
        asked.order = [k, o];
        return Promise.resolve({ data: mockError ? null : mockRows, error: mockError });
      };
      return chain;
    },
  },
}));
jest.mock('@/src/stores/auth', () => ({
  useAuthStore: (pick: (s: unknown) => unknown) => pick({ user: { id: 'u1' } }),
}));

const row = (n: number, part = 1) => ({ series_id: `s${n}`, series_title: `Series ${n}`, part_number: part });
const flush = () => act(async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); });

function sheet(visible = true) {
  return (
    <SeriesPicker
      visible={visible} chosen={null} bottomInset={0}
      onClose={() => {}} onSet={() => {}} onClear={() => {}}
    />
  );
}

beforeEach(() => {
  mockRows = [];
  mockError = null;
  mockAsked.length = 0;
});

describe('the series sheet', () => {
  it('says a list it could not read, rather than offering none', async () => {
    mockError = { message: 'TypeError: Network request failed' };
    const r = render(sheet());
    await flush();
    expect(r.getByText('Your series could not be read.')).toBeTruthy();
    // Beginning one stays open: the member can always start a sequence.
    expect(r.getByText('BEGIN A NEW SERIES')).toBeTruthy();
  });

  it('and reads it again on TRY AGAIN', async () => {
    mockError = { message: 'TypeError: Network request failed' };
    const r = render(sheet());
    await flush();
    mockError = null;
    mockRows = [row(1)];
    await act(async () => { fireEvent.press(r.getByLabelText('Read your series again')); });
    await flush();
    expect(r.getByText('Series 1')).toBeTruthy();
    expect(r.queryByText('Your series could not be read.')).toBeNull();
  });

  it('lists every series begun, newest first — not the first twelve the query happened to return', async () => {
    mockRows = Array.from({ length: 14 }, (_, i) => row(i + 1));
    const r = render(sheet());
    await flush();
    for (let n = 1; n <= 14; n++) expect(r.getByText(`Series ${n}`)).toBeTruthy();
    expect(mockAsked[0].order).toEqual(['created_at', { ascending: false }]);
  });

  it('opens fresh: a name half-typed and closed is not there the next time', async () => {
    const r = render(sheet());
    await flush();
    await act(async () => { fireEvent.press(r.getByLabelText('Begin a new series')); });
    await act(async () => { fireEvent.changeText(r.getByLabelText("The new series' name"), 'Ozu'); });
    expect(r.getByText('THIS ESSAY WILL BE FILED AS')).toBeTruthy();

    r.rerender(sheet(false));
    r.rerender(sheet(true));
    await flush();
    expect(r.queryByLabelText("The new series' name")).toBeNull();
    expect(r.queryByText('THIS ESSAY WILL BE FILED AS')).toBeNull();
  });
});
