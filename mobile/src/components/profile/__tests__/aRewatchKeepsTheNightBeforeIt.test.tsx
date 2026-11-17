/**
 * aRewatchKeepsTheNightBeforeIt.test.tsx — a rewatch adds a night; it never takes away the one
 * before it (review round 11).
 *
 * A film is one record per member, and a rewatch moves the record to the rewatch's day: the
 * viewing before it is kept in the record's history, with the day it was made. The run counted
 * the record's day alone, so a member who saw a film on five nights running, the fifth a second
 * look at the second night's film, read "3 NIGHTS RUNNING". And the Projector Room's heaviest
 * month counted records, not the films seen in it.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { computeDailyStreak } from '../profileComputed';
import { ProjectorRoom } from '../ProjectorRoom';

jest.mock('expo-haptics', () => ({ impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn() }));

/** A calendar date N days from `from`, as the member's own calendar reads it. */
function dayString(from: Date, offset: number): string {
  const d = new Date(from);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const NOW = new Date(2026, 10, 14, 21, 0, 0);

describe('the run counts every night a film was seen', () => {
  it('four films on four nights, then the second seen again tonight: five nights running', () => {
    const logs = [
      { watchedDate: dayString(NOW, -4), createdAt: null },
      // The second night's film, seen again tonight: its record moved to tonight, the night before kept.
      { watchedDate: dayString(NOW, 0), createdAt: null, viewingHistory: [{ date: dayString(NOW, -3) }] },
      { watchedDate: dayString(NOW, -2), createdAt: null },
      { watchedDate: dayString(NOW, -1), createdAt: null },
    ];
    expect(computeDailyStreak(logs, NOW)).toBe(5);
  });

  it('an earlier viewing kept with a time is counted on the member\'s own day', () => {
    const atNine = new Date(NOW);
    atNine.setDate(atNine.getDate() - 1);
    atNine.setHours(21, 0, 0, 0);
    const logs = [{ watchedDate: dayString(NOW, 0), createdAt: null, viewingHistory: [{ date: atNine.toISOString() }] }];
    expect(computeDailyStreak(logs, NOW)).toBe(2);
  });

  it('a history with no day, or no history, takes nothing away', () => {
    const logs = [
      { watchedDate: dayString(NOW, 0), createdAt: null, viewingHistory: [{}] },
      { watchedDate: dayString(NOW, -1), createdAt: null, viewingHistory: null },
    ];
    expect(computeDailyStreak(logs, NOW)).toBe(2);
  });
});

describe('the heaviest month is the month most films were seen in', () => {
  const stats = { count: 7, level: 'THE REGULAR', color: '#B8891A', progress: 40 };

  it('counts every viewing in its own month, not the records filed under it', () => {
    // March holds four records; January holds three, and two films of March seen again there.
    const { getByText, queryByText } = render(
      <ProjectorRoom
        stats={stats}
        user={{}}
        record={{
          monthly_activity: [{ month: '2026-03', count: 4 }, { month: '2026-01', count: 3 }],
          monthly_viewings: [{ month: '2026-03', count: 4 }, { month: '2026-01', count: 5 }],
        }}
      />,
    );
    expect(getByText("JAN '26")).toBeTruthy();
    expect(queryByText("MAR '26")).toBeNull();
  });

  it('from an older house, with records by month alone, the records still say it', () => {
    const { getByText } = render(
      <ProjectorRoom stats={stats} user={{}} record={{ monthly_activity: [{ month: '2026-03', count: 4 }, { month: '2026-01', count: 3 }] }} />,
    );
    expect(getByText("MAR '26")).toBeTruthy();
  });
});
