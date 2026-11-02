/**
 * The 29th of February is a day like any other (WORKLIST P4.32).
 *
 * With the clock at 2028-02-29 and 2028-03-01: today's date and the days either side of it, the
 * time until a moment across the leap day, a calendar date's age, the paper's day label, the date
 * picker's February, and the profile's year of days, which counts a film watched on the 29th.
 */
import { render } from '@testing-library/react-native';
import { localCalendarDate, timeAgo, timeUntil } from '../timeAgo';
import { dayLabel } from '@/src/components/dispatch/dayLabel';
import NitrateCalendar from '@/src/components/NitrateCalendar';
import NitrateCalendarGrid from '@/src/components/profile/NitrateCalendarGrid';

const LEAP_DAY = new Date(2028, 1, 29, 12, 0).getTime();
const MARCH_FIRST = new Date(2028, 2, 1, 12, 0).getTime();
const realNow = Date.now.bind(Date);
/** The phone's clock set to `ms` and running on from there: a render settles on time that moves. */
const at = (ms: number) => {
  const from = realNow();
  return jest.spyOn(Date, 'now').mockImplementation(() => ms + (realNow() - from));
};

afterEach(() => jest.restoreAllMocks());

it("names today, yesterday and tomorrow across the leap day", () => {
  expect([localCalendarDate(-1, LEAP_DAY), localCalendarDate(0, LEAP_DAY), localCalendarDate(1, LEAP_DAY)])
    .toEqual(['2028-02-28', '2028-02-29', '2028-03-01']);
  expect(localCalendarDate(-1, MARCH_FIRST)).toBe('2028-02-29');
});

it('counts the leap day in a time until and in an age', () => {
  expect(timeUntil(new Date(MARCH_FIRST).toISOString(), new Date(2028, 1, 28, 12, 0).getTime())).toBe('IN 2 DAYS');
  expect(timeAgo('2028-02-29', MARCH_FIRST)).toBe('YESTERDAY');
  expect(timeAgo('2028-02-28', MARCH_FIRST)).toBe('2 DAYS AGO');
});

it("prints the paper's label for the 29th", () => {
  expect(dayLabel(new Date(LEAP_DAY).toISOString())).toBe('TUESDAY, FEBRUARY 29');
});

it("draws the picker's February 2028 with its 29th and no 30th", async () => {
  at(LEAP_DAY);
  const { getByText, queryByText } = await render(<NitrateCalendar value="2028-02-29" onChange={() => undefined} />);
  expect(getByText('29')).toBeTruthy();
  expect(queryByText('30')).toBeNull();
});

it("counts a film watched on the 29th in the profile's year of days, the day itself and the day after", async () => {
  const days = [{ day: '2028-02-29', films: 1 }];
  at(LEAP_DAY);
  const first = await render(<NitrateCalendarGrid days={days} isSelf={false} />);
  expect(first.getByText('1 FILM IN THE PAST YEAR')).toBeTruthy();
  first.unmount();
  at(MARCH_FIRST);
  const then = await render(<NitrateCalendarGrid days={days} isSelf={false} />);
  expect(then.getByText('1 FILM IN THE PAST YEAR')).toBeTruthy();
});
