/**
 * The margin prints a bare value, as a ledger does: `21:40`, `3`, `28`. A
 * screen reader is told what the value is, and the value alone cannot say:
 * `28` is a day in a member's room and 28 certifications on the feed.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { PaperPost, type PaperOrder } from '@/src/components/dispatch/paper/PaperPost';

const said = (order: string, orderIs: PaperOrder) => render(
  <PaperPost kind="take" author={null} body="A take." order={order} orderIs={orderIs} measureWidth={300} />,
).getByText(order).props.accessibilityLabel;

describe('the margin says what its value is', () => {
  it('an hour, a count and a day', () => {
    expect(said('21:40', 'hour')).toBe('Filed at 21:40');
    expect(said('28', 'count')).toBe('28 certified');
    expect(said('28', 'day')).toBe('Filed on the 28th');
  });

  it('a dash, as whatever is missing', () => {
    expect(said('—', 'hour')).toBe('Time not known');
    expect(said('—', 'count')).toBe('Not certified');
    expect(said('—', 'day')).toBe('Date not known');
  });

  it('every day of the month as a spoken ordinal', () => {
    const cases: Record<string, string> = {
      1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 10: '10th', 11: '11th', 12: '12th', 13: '13th',
      20: '20th', 21: '21st', 22: '22nd', 23: '23rd', 24: '24th', 30: '30th', 31: '31st',
    };
    for (const [day, spoken] of Object.entries(cases)) {
      expect(said(day, 'day')).toBe(`Filed on the ${spoken}`);
    }
  });
});
