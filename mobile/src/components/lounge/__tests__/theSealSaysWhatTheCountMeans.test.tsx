/**
 * theSealSaysWhatTheCountMeans.test.tsx — a salon card's unread seal, seen and said.
 *
 * The house counts a salon's unread dispatches only as far as the card can
 * show them: get_lounge_unread_counts stops at 100. The seal reads "9+ NEW"
 * past nine, and the spoken label says the number — so at the server's limit
 * it must say "more than 99", never a total it does not have.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';

jest.mock('@/src/utils/typedRouter', () => ({ nav: { push: jest.fn() } }));

// eslint-disable-next-line import/first
import { JoinedLoungeCard, UNREAD_COUNTED_TO } from '../JoinedLoungeCard';

const room = (over: Record<string, unknown>) => ({
  id: 'l1', name: 'The Back Row', description: '', is_private: false, creator_id: 'host',
  created_at: '2026-01-01T00:00:00Z', member_count: 4, membership_status: 'approved',
  pending_count: 0, ...over,
}) as never;

const seen = (unread: number) => {
  const r = render(<JoinedLoungeCard lounge={room({ unread_count: unread })} index={0} />);
  const label = r.getByRole('button').props.accessibilityLabel as string;
  return { label, seal: r.queryByText(/NEW$/)?.props.children as string | undefined };
};

describe('the unread seal', () => {
  it('says the count while it is a count', () => {
    expect(seen(5)).toEqual({ label: 'Enter salon The Back Row, 5 new dispatches', seal: '5 NEW' });
    expect(seen(9).seal).toBe('9 NEW');
  });

  it('shows 9+ past nine, and still says the number', () => {
    expect(seen(42)).toEqual({ label: 'Enter salon The Back Row, 42 new dispatches', seal: '9+ NEW' });
  });

  it('at the server\'s limit, says "more than 99" — the count stopped there', () => {
    expect(seen(UNREAD_COUNTED_TO)).toEqual({ label: 'Enter salon The Back Row, more than 99 new dispatches', seal: '9+ NEW' });
    expect(seen(UNREAD_COUNTED_TO - 1).label).toBe('Enter salon The Back Row, 99 new dispatches');
  });

  it('shows no seal and says nothing when nothing waits', () => {
    expect(seen(0)).toEqual({ label: 'Enter salon The Back Row', seal: undefined });
  });

  it('stops where the database stops', () => {
    // The limit lives in SQL (the speed change under measurement, then the
    // migration that carries it); the card's number must be the same one.
    const sql = readFileSync(join(__dirname, '..', '..', '..', '..', 'e2e', 'load', 'proposed.sql'), 'utf8');
    const fn = sql.slice(sql.indexOf('FUNCTION public.get_lounge_unread_counts'));
    expect(fn.slice(0, fn.indexOf('$$;'))).toContain(`LIMIT ${UNREAD_COUNTED_TO}`);
  });
});
