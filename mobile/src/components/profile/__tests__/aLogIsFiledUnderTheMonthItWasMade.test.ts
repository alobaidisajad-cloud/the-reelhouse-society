/**
 * A record is filed under the month a member would say it falls in, in every zone (round 14).
 *
 * The rooms grouped a log with no watched date by the UTC day of its making: west of UTC, a log
 * made on the evening of 31 December filed under January. A watched date is its own calendar day;
 * a moment is read on the member's clock. Run in six zones by `npm run test:tz`.
 */
import { groupByMonth } from '../profileComputed';

/** An instant at the member's own local evening of a day. */
const evening = (y: number, m: number, d: number) => new Date(y, m - 1, d, 21, 30).toISOString();

it('a log with no watched date, made on New Year’s Eve evening, stays in December', () => {
  const log = { id: 'a', watchedDate: null, createdAt: evening(2025, 12, 31) };
  expect(Object.keys(groupByMonth([log]))).toEqual(['DECEMBER 2025']);
});

it('a watched date is its own calendar day, whatever the zone', () => {
  const logs = [
    { id: 'b', watchedDate: '2026-01-01', createdAt: evening(2026, 1, 3) },
    { id: 'c', watchedDate: '2025-12-31', createdAt: evening(2026, 1, 3) },
  ];
  expect(groupByMonth(logs)).toEqual({ 'JANUARY 2026': [logs[0]], 'DECEMBER 2025': [logs[1]] });
});

it('another key is read the same way, and nothing readable stands under January 1970', () => {
  expect(Object.keys(groupByMonth([{ id: 'd', acquiredAt: '2024-07-04' }], 'acquiredAt'))).toEqual(['JULY 2024']);
  expect(Object.keys(groupByMonth([{ id: 'e', watchedDate: 'not a date' }]))).toEqual(['JANUARY 1970']);
});
