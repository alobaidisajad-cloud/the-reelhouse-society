/**
 * theSeriesSheet.test.tsx — the sheet that rejoins a series says what it read.
 *
 * Three faults, each found by reading it: a list that could not be read looked
 * like "none begun" (and a member would begin a second series under the same
 * name); a thirteenth series could not be rejoined; and reopening the sheet drew
 * the old pick for a frame. A half-typed name is kept (stage C: nothing a member
 * types is lost), opened on again, and let go once the series is set.
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
  useAuthStore: Object.assign((pick: (s: unknown) => unknown) => pick({ user: { id: 'u1' } }), { getState: () => ({ user: { id: 'u1' } }) }),
}));

// Each test opens with no name kept from the last.
beforeEach(() => { require('@/src/stores/mmkv-storage').storage.clearAll(); });

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
  it('closes on Android\'s back, before the essay room beneath is left', async () => {
    const { BackHandler } = require('react-native') as typeof import('react-native');
    const heard: (() => boolean | null | undefined)[] = [];
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_e, fn) => {
      heard.unshift(fn as () => boolean);
      return { remove: () => { heard.splice(heard.indexOf(fn as () => boolean), 1); } };
    });
    try {
      let closed = false;
      render(<SeriesPicker visible chosen={null} bottomInset={0} onClose={() => { closed = true; }} onSet={() => {}} onClear={() => {}} />);
      await flush();
      let took = false;
      await act(async () => { took = heard.some((h) => h() === true); });
      expect(took).toBe(true);
      expect(closed).toBe(true);
    } finally { spy.mockRestore(); }
  });
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
    await act(async () => { await fireEvent.press(r.getByLabelText('Try again: read your series')); });
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

  it('keeps a name half-typed: closed, it opens on it again, and once the series is set it is let go', async () => {
    const onSet = jest.fn();
    const at = (visible: boolean) => (
      <SeriesPicker visible={visible} chosen={null} bottomInset={0} onClose={() => {}} onSet={onSet} onClear={() => {}} />
    );
    const r = render(at(true));
    await flush();
    await act(async () => { await fireEvent.press(r.getByLabelText('Begin a new series')); });
    await act(async () => { await fireEvent.changeText(r.getByLabelText("The new series' name"), 'Ozu'); });
    expect(r.getByText('THIS ESSAY WILL BE FILED AS')).toBeTruthy();

    await act(async () => { r.rerender(at(false)); });
    await act(async () => { r.rerender(at(true)); });
    await flush();
    expect(r.getByLabelText("The new series' name").props.value).toBe('Ozu');
    await act(async () => { await fireEvent.press(r.getByLabelText('Set the series')); });
    expect(JSON.stringify(onSet.mock.calls[0])).toContain('Ozu');

    // Set: the essay holds it, and the next opening starts with no name.
    await act(async () => { r.rerender(at(false)); });
    await act(async () => { r.rerender(at(true)); });
    await flush();
    expect(r.queryByLabelText("The new series' name")).toBeNull();
  });

  // P4.40: a member who types sets the series with Enter, as with SET THE SERIES.
  it('Enter in a new series\' name sets it; with no name yet, sets nothing', async () => {
    const onSet = jest.fn();
    const r = render(
      <SeriesPicker visible chosen={null} bottomInset={0} onClose={() => {}} onSet={onSet} onClear={() => {}} />,
    );
    await flush();
    await act(async () => { await fireEvent.press(r.getByLabelText('Begin a new series')); });
    await act(async () => { await fireEvent(r.getByLabelText("The new series' name"), 'submitEditing'); });
    expect(onSet).not.toHaveBeenCalled();
    await act(async () => { await fireEvent.changeText(r.getByLabelText("The new series' name"), 'Ozu'); });
    await act(async () => { await fireEvent(r.getByLabelText("The new series' name"), 'submitEditing'); });
    expect(onSet).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(onSet.mock.calls[0])).toContain('Ozu');
  });
});
