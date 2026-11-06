/**
 * releaseOf — when a film came out, or why it has not.
 *
 * A date the house has not reached yet is not a release: the film OPENS then.
 * A film with no date at all is not "—" if TMDB says why (it is planned, in
 * production, cancelled), and the why is what the page says. A date is read
 * as the calendar date it is, never through a Date, so 1895 is 1895 on every
 * clock.
 */
import { getYear } from '@/src/lib/tmdb';
import { calendarDateString, formatTMDBDate, localCalendarDate } from '@/src/utils/timeAgo';

/** TMDB's statuses for a film that is not out, in the house's words. */
const NOT_OUT: Record<string, string> = {
  Rumored: 'Rumoured',
  Planned: 'Planned',
  'In Production': 'In production',
  'Post Production': 'In post-production',
  Canceled: 'Cancelled',
};

interface Dated {
  release_date?: string | null;
  status?: string | null;
}

/** Whether a release date is still ahead of today; a bare year is ahead when its year is. */
export function isAhead(date: string | null | undefined, today: string = localCalendarDate()): boolean {
  if (!date) return false;
  if (/^\d{4}$/.test(date)) return date > today.slice(0, 4);
  const day = calendarDateString(date);
  return day !== null && day > today;
}

/** THE PARTICULARS' release row: its label and what it says, or nothing to say. */
export function releaseOf(film: Dated, today?: string): { label: 'RELEASE' | 'OPENS'; value: string } | null {
  if (film.status === 'Canceled') return { label: 'RELEASE', value: NOT_OUT.Canceled! };
  const date = formatTMDBDate(film.release_date, 'long');
  if (date) return { label: isAhead(film.release_date, today) ? 'OPENS' : 'RELEASE', value: date };
  const why = film.status ? NOT_OUT[film.status] : undefined;
  return why ? { label: 'RELEASE', value: why } : null;
}

/** The year under the title: the year, or why there is none, or '—'. */
export function yearOf(film: Dated): string {
  const year = getYear(film.release_date);
  if (year !== '—') return year;
  return (film.status && NOT_OUT[film.status]?.toUpperCase()) || '—';
}

/** Particulars where none is known read as one '—', never '—  ·  —'. */
export function oneDash(parts: string[]): string[] {
  return parts.every((p) => p === '—') ? ['—'] : parts;
}
