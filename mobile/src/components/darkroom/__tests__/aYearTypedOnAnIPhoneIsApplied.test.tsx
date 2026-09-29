/**
 * aYearTypedOnAnIPhoneIsApplied.test.tsx — the Darkroom's year range takes the
 * year when editing ENDS, not only on "return".
 *
 * The fields use the number pad, and the iPhone's number pad has no return key:
 * on onSubmitEditing alone, a year typed there was never applied. Editing ends on
 * a tap away or a scroll as well, so the year is committed then.
 */
import React, { useState } from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { DarkroomFilterPanel } from '../DarkroomFilterPanel';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@react-navigation/native', () => ({ useIsFocused: () => true }));
jest.mock('@/src/lib/tmdb', () => ({ tmdb: { search: jest.fn(), detail: jest.fn() } }));

type Filters = Parameters<typeof DarkroomFilterPanel>[0]['filters'];
const BASE = {
  genreId: null, decade: null, language: null, minRating: 0, yearFrom: null, yearTo: null, sortBy: 'popularity.desc',
} as unknown as Filters;

function Panel({ start = {}, onUpdate }: { start?: Partial<Filters>; onUpdate: jest.Mock }) {
  const [filters, setFilters] = useState<Filters>({ ...BASE, ...start } as Filters);
  const [from, setFrom] = useState(start.yearFrom ? String(start.yearFrom) : '');
  const [to, setTo] = useState(start.yearTo ? String(start.yearTo) : '');
  return (
    <DarkroomFilterPanel
      filters={filters}
      updateFilter={(p) => { onUpdate(p); setFilters((f) => ({ ...f, ...p })); }}
      localYearFrom={from} setLocalYearFrom={setFrom}
      localYearTo={to} setLocalYearTo={setTo}
    />
  );
}

const typeThenLeave = async (field: unknown, text: string) => {
  await act(async () => { fireEvent.changeText(field as never, text); });
  await act(async () => { fireEvent(field as never, 'endEditing'); });
};

describe('the Darkroom’s year range', () => {
  it('applies a year when editing ends, with no return key pressed', async () => {
    const onUpdate = jest.fn();
    const r = render(<Panel onUpdate={onUpdate} />);
    await typeThenLeave(r.getByLabelText('From the year'), '1999');
    expect(onUpdate).toHaveBeenCalledWith({ yearFrom: 1999, decade: null });
  });

  it('reads two digits as the century they belong to', async () => {
    const onUpdate = jest.fn();
    const r = render(<Panel onUpdate={onUpdate} />);
    await typeThenLeave(r.getByLabelText('From the year'), '85');
    expect(onUpdate).toHaveBeenLastCalledWith({ yearFrom: 1985, decade: null });
    await typeThenLeave(r.getByLabelText('To the year'), '12');
    expect(onUpdate).toHaveBeenLastCalledWith({ yearTo: 2012, decade: null });
  });

  it('moves both ends to a year typed past the other end', async () => {
    const onUpdate = jest.fn();
    const r = render(<Panel start={{ yearTo: 1970 }} onUpdate={onUpdate} />);
    await typeThenLeave(r.getByLabelText('From the year'), '1990');
    expect(onUpdate).toHaveBeenLastCalledWith({ yearFrom: 1990, yearTo: 1990, decade: null });
  });

  it('clears a year that is emptied', async () => {
    const onUpdate = jest.fn();
    const r = render(<Panel start={{ yearFrom: 1960 }} onUpdate={onUpdate} />);
    await typeThenLeave(r.getByLabelText('From the year'), '');
    expect(onUpdate).toHaveBeenLastCalledWith({ yearFrom: null, decade: null });
  });

  it('does not rewrite a filter that has not changed', async () => {
    const onUpdate = jest.fn();
    const r = render(<Panel start={{ yearFrom: 1960 }} onUpdate={onUpdate} />);
    await typeThenLeave(r.getByLabelText('From the year'), '1960');
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
