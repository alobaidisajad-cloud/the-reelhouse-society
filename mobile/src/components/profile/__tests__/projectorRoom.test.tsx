/**
 * projectorRoom.test.tsx — the two panels this pass REBUILT, actually mounted.
 *
 * Both were rewritten and neither had ever been rendered by a test. Every claim
 * about them was a claim about source text. That is the weakest kind of
 * verification available and it is exactly where the reanimated mock gap hid
 * for months — a component nobody could mount is a component nobody checked.
 *
 * These are behaviour tests, not snapshots: a snapshot would pass while showing
 * a wrong streak, and the streak was wrong in production for every member until
 * last week.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import { ProjectorRoom } from '../ProjectorRoom';
import { TasteDNA } from '../TasteDNA';
import type { TasteProfile } from '@/src/constants/taste';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  notificationAsync: jest.fn(),
  selectionAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  shareAsync: jest.fn().mockResolvedValue(undefined),
  isAvailableAsync: jest.fn().mockResolvedValue(true),
}));

const stats = (count: number) => ({
  count,
  level: 'THE REGULAR',
  color: '#B8891A',
  progress: 0.4,
});

const taste = (over: Partial<TasteProfile> = {}): TasteProfile => ({
  films_total: 100,
  films_known: 100,
  genres: [
    { name: 'Drama', count: 40 },
    { name: 'Horror', count: 25 },
  ],
  actors: [],
  directors: [],
  countries: [],
  total_runtime: 0,
  ...over,
});

// ════════════════════════════════════════════════════════════════════════════
describe('ProjectorRoom renders a real record', () => {
  it('mounts at all', () => {
    // The floor. Before the harness was fixed this threw on FadeInRight.
    const { toJSON } = render(<ProjectorRoom stats={stats(42)} user={{ username: 'kane' }} />);
    expect(toJSON()).not.toBeNull();
  });

  it('shows the film count it was given', () => {
    // getAllByText, not getByText: the number appears twice by design — once in
    // the dial and once in the certificate text beneath it.
    const { getAllByText } = render(<ProjectorRoom stats={stats(1247)} user={{ username: 'kane' }} />);
    expect(getAllByText(/1,247/).length).toBeGreaterThan(0);
  });

  it('DERIVES the standing from the count, ignoring the level it was handed', () => {
    // The prop says THE REGULAR; 1,247 films is THE ORACLE. The component must
    // trust the shared ladder over its caller — otherwise two screens can
    // disagree about the same member, which is the bug the one ladder replaced.
    // getAllByText: the standing is printed twice by design — once as the
    // heading and once inside the certificate wording below it.
    const { getAllByText, queryByText } = render(
      <ProjectorRoom stats={{ ...stats(1247), level: 'THE REGULAR' }} user={{ username: 'kane' }} />,
    );
    expect(getAllByText('THE ORACLE').length).toBeGreaterThan(0);
    expect(queryByText('THE REGULAR')).toBeNull();
  });

  it('survives no record at all — the visitor case', () => {
    // A visitor to a sealed profile gets no analytics payload. It must render
    // the dial rather than crash on `record.current_streak`.
    const { toJSON } = render(<ProjectorRoom stats={stats(9)} user={{}} record={null} />);
    expect(toJSON()).not.toBeNull();
  });

  it('renders the longest run the server returned', () => {
    const { getByText } = render(
      <ProjectorRoom
        stats={stats(200)}
        user={{ username: 'kane' }}
        record={{ longest_streak: 31, avg_rating: 3.5, monthly_activity: [] }}
      />,
    );
    expect(getByText('31')).toBeTruthy();
    expect(getByText('LONGEST RUN')).toBeTruthy();
  });

  /**
   * THE RUN A MEMBER IS ACTUALLY ON.
   *
   * `current_streak` was declared on this component's props and never drawn.
   * It came from the server, through the hook, through profileComputed — and
   * the screen never destructured it. The SQL fix that made this number correct
   * was repairing something no member could see.
   */
  it('shows the current run, which used to reach the phone and stop', () => {
    const { getByText } = render(
      <ProjectorRoom
        stats={stats(200)}
        user={{ username: 'kane' }}
        record={{ longest_streak: 31, current_streak: 4, avg_rating: 3.5, monthly_activity: [] }}
      />,
    );
    expect(getByText('4 NIGHTS RUNNING')).toBeTruthy();
  });

  it('does not call a single evening a run', () => {
    // "1 NIGHTS RUNNING" is not a sentence, and one logged night is not a run.
    const { queryByText } = render(
      <ProjectorRoom stats={stats(200)} user={{}} record={{ current_streak: 1, monthly_activity: [] }} />,
    );
    expect(queryByText(/NIGHTS RUNNING/)).toBeNull();
  });

  it('says nothing about a run when the streak is broken or unknown', () => {
    for (const current_streak of [0, null, undefined]) {
      const { queryByText } = render(
        <ProjectorRoom stats={stats(200)} user={{}} record={{ current_streak, monthly_activity: [] }} />,
      );
      expect(queryByText(/RUNNING/)).toBeNull();
    }
  });

  it('prefers the resolved streak over the raw record', () => {
    /**
     * Caught by mutation: every other test here passes the run via `record`, so
     * a component reading `record.current_streak` and ignoring the prop passed
     * them all. The prop is the one the SCREEN resolved — server figure with a
     * local fallback — and it must win, or the fallback is dead the moment an
     * analytics payload arrives with a stale number in it.
     */
    const { getByText, queryByText } = render(
      <ProjectorRoom
        stats={stats(200)}
        user={{}}
        streak={7}
        record={{ current_streak: 2, monthly_activity: [] }}
      />,
    );
    expect(getByText('7 NIGHTS RUNNING')).toBeTruthy();
    expect(queryByText('2 NIGHTS RUNNING')).toBeNull();
  });

  it('falls back to the record when the screen resolved nothing', () => {
    // The other half of the same rule: `streak` absent must not blank the run.
    const { getByText } = render(
      <ProjectorRoom stats={stats(200)} user={{}} record={{ current_streak: 5, monthly_activity: [] }} />,
    );
    expect(getByText('5 NIGHTS RUNNING')).toBeTruthy();
  });

  it('shows the run even for a member at the top of the ladder', () => {
    // The highest standing takes a different branch (no progress bar). The run
    // must not disappear with it — that member has the longest habit of anyone.
    const { getByText } = render(
      <ProjectorRoom stats={stats(5000)} user={{}} record={{ current_streak: 12, monthly_activity: [] }} />,
    );
    expect(getByText('the highest standing in the house')).toBeTruthy();
    expect(getByText('12 NIGHTS RUNNING')).toBeTruthy();
  });

  it('accepts avg_rating as a string, which is what postgres numeric returns', () => {
    // supabase-js hands back `numeric` as a STRING. A component doing
    // `avg.toFixed(1)` on it throws; one doing `${avg}` prints "3.50000".
    const { toJSON } = render(
      <ProjectorRoom
        stats={stats(200)}
        user={{ username: 'kane' }}
        record={{ avg_rating: '3.4285714285714286', monthly_activity: [] }}
      />,
    );
    const flat = JSON.stringify(toJSON());
    expect(flat).not.toContain('3.4285714285714286');
    expect(flat).toContain('3.4');
  });

  it('does not crash on a month key it cannot parse', () => {
    const { toJSON } = render(
      <ProjectorRoom
        stats={stats(5)}
        user={{}}
        record={{ monthly_activity: [{ month: 'not-a-month', count: 3 }, { month: '2024-03', count: 9 }] }}
      />,
    );
    expect(toJSON()).not.toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════════
describe('TasteDNA draws only what the server counted', () => {
  it('mounts and shows the genres', () => {
    // Genre names are drawn uppercase, and appear twice: once in the strip and
    // once on the off-screen canvas the share button captures.
    const { getAllByText } = render(<TasteDNA taste={taste()} username="kane" memberNo="0042" />);
    expect(getAllByText('TASTE DNA').length).toBeGreaterThan(0);
    expect(getAllByText('DRAMA').length).toBeGreaterThan(0);
    expect(getAllByText('HORROR').length).toBeGreaterThan(0);
  });

  it('renders nothing below the coverage floor', () => {
    // 30 of 2000 read. The old component would have drawn a confident
    // fingerprint from whatever it happened to have.
    const { toJSON } = render(
      <TasteDNA taste={taste({ films_total: 2000, films_known: 30 })} username="kane" />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when there is no payload', () => {
    expect(render(<TasteDNA taste={null} username="kane" />).toJSON()).toBeNull();
  });

  it('says what it was drawn from while that is still less than everything', () => {
    const { getByText } = render(
      <TasteDNA taste={taste({ films_total: 100, films_known: 95 })} username="kane" />,
    );
    expect(getByText(/from 95 of your 100 films/)).toBeTruthy();
  });

  it('drops that line once the whole archive is read', () => {
    const { getByText, queryByText } = render(<TasteDNA taste={taste()} username="kane" />);
    expect(queryByText(/from .* of your .* films/)).toBeNull();
    expect(getByText('Your cinematic fingerprint')).toBeTruthy();
  });

  it('divides by films READ, not by the whole archive', () => {
    // 40 Drama of 50 read is 80%. Dividing by films_total would print 40% —
    // an honest-looking number from two different denominators.
    const { getByText } = render(
      <TasteDNA taste={taste({ films_total: 50, films_known: 50 })} username="kane" />,
    );
    expect(getByText('80%')).toBeTruthy();
  });
});
