/**
 * Year in Cinema keeps the year it read (WORKLIST P4.53).
 *
 * Each opening read the member's whole year again behind "Developing your year…", thousands of
 * rows for a member who imported their past, though the year had not changed since the last
 * opening a minute before. The year told is kept by who reads it and which year: a second opening
 * draws it at once and reads it again beneath, so a film logged since is counted. A read that
 * fails with no year kept says so, and asking again reads again.
 */
import { act, fireEvent, render } from '@testing-library/react-native';
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

const realNow = Date.now.bind(Date);
beforeEach(() => {
  const from = realNow();
  jest.spyOn(Date, 'now').mockImplementation(() => new Date('2027-03-10T12:00:00').getTime() + (realNow() - from));
  fetchYearLogs.mockReset();
  useAuthStore.setState({ user: { id: 'me', username: 'member' } as never });
});
afterEach(() => jest.restoreAllMocks());

/** The screen, opened or closed, under the one query client the render keeps. */
const Opened = ({ open }: { open: boolean }) => (open ? <YearInCinemaScreen /> : null);

it('a second opening draws the year it last read at once, and reads it again beneath', async () => {
  fetchYearLogs.mockResolvedValue([log('2027-01-20', 1), log('2027-02-02', 2)]);
  const screen = await render(<Opened open />);
  expect(await screen.findByText('2027')).toBeTruthy();
  await screen.rerender(<Opened open={false} />);
  // A while closed, as a member is between two openings: a year kept only while drawn is gone by now.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });

  let answer!: (logs: YearLogInput[]) => void;
  fetchYearLogs.mockImplementation(() => new Promise((resolve) => { answer = resolve; }));
  await screen.rerender(<Opened open />);
  // Drawn before the second read answers: the kept year, not "Developing your year…".
  expect(screen.getByText('2027')).toBeTruthy();
  expect(screen.queryByText('Developing your year…')).toBeNull();
  expect(fetchYearLogs).toHaveBeenCalledTimes(2);
  await act(async () => answer([log('2027-01-20', 1), log('2027-02-02', 2), log('2027-03-09', 3)]));
  expect(screen.getByText('2027')).toBeTruthy();
});

it('a read that fails with no year kept says so, and asking again reads again', async () => {
  fetchYearLogs.mockRejectedValue(Object.assign(new Error('Failed to fetch'), { code: '' }));
  const screen = await render(<YearInCinemaScreen />);
  expect(await screen.findByText('The projector jammed')).toBeTruthy();
  // The read and its one more try (queryPolicy), and no more.
  expect(fetchYearLogs).toHaveBeenCalledTimes(2);

  fetchYearLogs.mockResolvedValue([log('2027-02-02', 1)]);
  await fireEvent.press(screen.getByText('TRY AGAIN'));
  expect(await screen.findByText('2027')).toBeTruthy();
  expect(fetchYearLogs).toHaveBeenCalledTimes(3);
});
