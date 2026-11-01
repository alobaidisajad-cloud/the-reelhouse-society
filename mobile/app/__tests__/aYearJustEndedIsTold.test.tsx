/**
 * The year just ended is told through January (WORKLIST P4.32).
 *
 * Year in Cinema told the year under way alone, so on the 2nd of January a member's whole past
 * year had no door. Its one door (the profile's YOUR YEAR IN CINEMA) opens the screen with no
 * year; through January the screen tells the year just ended, or the year under way when the
 * past one holds nothing of theirs, and from February the year under way.
 */
import { render } from '@testing-library/react-native';
import YearInCinemaScreen from '../year-in-cinema';
import { useAuthStore } from '@/src/stores/auth';
import type { YearLogInput } from '@/src/services/YearInCinemaService';

jest.mock('@/src/services/YearInCinemaService', () => ({
  ...jest.requireActual('@/src/services/YearInCinemaService'),
  fetchYearLogs: jest.fn(),
}));
const { fetchYearLogs } = jest.requireMock('@/src/services/YearInCinemaService') as { fetchYearLogs: jest.Mock };

const log = (watchedDate: string, n: number): YearLogInput =>
  ({ id: n, title: `Film ${n}`, poster: null, rating: 4, watchedDate, createdAt: watchedDate });
/** The member's logs, by year. */
const LOGS: Record<number, YearLogInput[]> = {};

beforeEach(() => {
  for (const y of Object.keys(LOGS)) delete LOGS[Number(y)];
  fetchYearLogs.mockReset();
  fetchYearLogs.mockImplementation(async (_member: string, year: number) => LOGS[year] ?? []);
  useAuthStore.setState({ user: { id: 'me', username: 'member' } as never });
});
afterEach(() => jest.restoreAllMocks());

const realNow = Date.now.bind(Date);
/** The phone's clock set to `iso` and running on from there: a render settles on time that moves. */
const on = (iso: string) => {
  const from = realNow();
  return jest.spyOn(Date, 'now').mockImplementation(() => new Date(iso).getTime() + (realNow() - from));
};

it("opens on the 2nd of January with the member's past year", async () => {
  on('2027-01-02T12:00:00');
  LOGS[2026] = [log('2026-03-04', 1), log('2026-11-20', 2)];
  const { findByText } = await render(<YearInCinemaScreen />);
  expect(await findByText('2026')).toBeTruthy();
  expect(fetchYearLogs.mock.calls.map((c) => c[1])).toEqual([2026]);
});

it('tells the year under way in January when the past year holds nothing of theirs', async () => {
  on('2027-01-02T12:00:00');
  LOGS[2027] = [log('2027-01-01', 1)];
  const { findByText } = await render(<YearInCinemaScreen />);
  expect(await findByText('2027')).toBeTruthy();
  expect(fetchYearLogs.mock.calls.map((c) => c[1])).toEqual([2026, 2027]);
});

it('tells the year under way from February', async () => {
  on('2027-02-01T12:00:00');
  LOGS[2026] = [log('2026-03-04', 1)];
  LOGS[2027] = [log('2027-01-20', 2)];
  const { findByText } = await render(<YearInCinemaScreen />);
  expect(await findByText('2027')).toBeTruthy();
  expect(fetchYearLogs.mock.calls.map((c) => c[1])).toEqual([2027]);
});
