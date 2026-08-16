/**
 * logRender.test.tsx — the log surfaces, actually mounted.
 *
 * logSurfaces.test.ts reads source: it proves a stylesheet says what it should
 * and a prop is spelled where it should be. It cannot prove the thing renders,
 * or that a real record produces the words a member ends up reading. This does.
 *
 * Queries come from each render's own result rather than the global `screen`,
 * which this project's jest setup does not bind.
 */
import React from 'react';
import { render } from '@testing-library/react-native';

import LogHero from '@/src/components/log/LogHero';
import LogChronicle from '@/src/components/log/LogChronicle';
import LogReviewBody from '@/src/components/log/LogReviewBody';

// No local expo-image mock: the shared one in jest.setup.ts renders a real
// element now, so any surface with an image can simply be mounted.

const baseLog = {
  film_id: 27205,
  film_title: 'Inception',
  year: 2010,
  rating: 4.5,
  status: 'watched',
  watched_date: '2026-08-05' as string | null,
  watched_with: null as string | null,
  physical_media: null as string | null,
  poster_path: '/p.jpg',
};

const profile = { username: 'mara', role: 'auteur', avatar_url: null };

const hero = (over: Partial<typeof baseLog> = {}) =>
  render(
    <LogHero
      log={{ ...baseLog, ...over }}
      profile={profile}
      posterUri="https://example.test/p.jpg"
      isAuteur={false}
      isArchivist={false}
      timeAgo="2h"
      onPosterLoaded={() => {}}
      onPressUser={() => {}}
      onPressFilm={() => {}}
    />,
  );

describe('the filing mark, as a member sees it', () => {
  it('states the facts it has, in the record’s own shapes', () => {
    const r = hero({ watched_with: 'Yusuf', physical_media: '4K UHD' });
    expect(r.getByText('FILED')).toBeTruthy();
    expect(r.getByText('AUG 5, 2026')).toBeTruthy();
    expect(r.getByText('WITH YUSUF')).toBeTruthy();
    expect(r.getByText('4K UHD')).toBeTruthy();
  });

  it('never announces the absence of a format', () => {
    // 'None' is a real, selectable option in the composer.
    const r = hero({ physical_media: 'None' });
    expect(r.queryByText(/NONE/)).toBeNull();
    expect(r.queryByText(/FORMAT/)).toBeNull();
  });

  it('shows no band at all when nothing was recorded', () => {
    const r = hero({ watched_date: null, watched_with: null, physical_media: null });
    expect(r.queryByText('FILED')).toBeNull();
  });

  it('a date it cannot read is not a fact', () => {
    // Not the same case as a missing date: this one is PRESENT and truthy, and
    // would put an empty caption inside the ruled band.
    const r = hero({ watched_date: 'whenever', watched_with: null, physical_media: null });
    expect(r.queryByText('FILED')).toBeNull();
  });

  it('a record with no date still renders its title and year', () => {
    const r = hero({ watched_date: null });
    expect(r.getByText('Inception')).toBeTruthy();
    expect(r.getByText('2010')).toBeTruthy();
  });
});

describe('the essay, as a member reads it', () => {
  const body = (props: Record<string, unknown>) =>
    render(
      <LogReviewBody
        review={null}
        pullQuote={null}
        dropCap={false}
        isAuteur={false}
        isOwner={false}
        isSpoiler={false}
        privateNotes={null}
        {...props}
      />,
    );

  it('renders nothing when there is nothing to read', () => {
    // A rating-only log used to leave a 40pt hole where the essay would be.
    expect(body({}).toJSON()).toBeNull();
  });

  it('an empty paragraph of markup is nothing to read', () => {
    // The column is not empty — it holds tags — but there are no words in it.
    expect(body({ review: '<p></p><div></div>' }).toJSON()).toBeNull();
  });

  it('keeps a member’s angle brackets and drops real tags', () => {
    // LITERAL brackets, which is what the composer stores when someone types
    // them. Escaped ones (&lt;) survive any tag-stripper, so testing those
    // proves nothing about the rule — the first version of this test used them
    // and passed against the cleaner that ate the words.
    const r = body({ review: '<p>Watched <The Batman> again</p><p>Still <em>great</em></p>' });
    expect(r.getByText(/Watched <The Batman> again/)).toBeTruthy();
    expect(r.getByText(/Still great/)).toBeTruthy();
  });

  it('decodes what the web editor escaped', () => {
    const r = body({ review: '<p>Powell &amp; Pressburger &mdash; &quot;perfect&quot;</p>' });
    expect(r.getByText('Powell & Pressburger — "perfect"')).toBeTruthy();
  });

  it('splits an essay into the paragraphs it was written in', () => {
    const r = body({ review: '<p>One.</p><p>Two.</p><p>Three.</p>' });
    for (const p of ['One.', 'Two.', 'Three.']) expect(r.getByText(p)).toBeTruthy();
  });

  it('lifts an initial out of the first paragraph', () => {
    const r = body({ review: 'Rain on the window all night.', dropCap: true });
    expect(r.getByText('R')).toBeTruthy();
  });

  it('does not lift one out of Arabic, where letters join', () => {
    const arabic = 'المطر على النافذة طوال الليل.';
    const r = body({ review: arabic, dropCap: true });
    expect(r.getByText(arabic)).toBeTruthy();
    // The assertion that does the work. getByText matches the COMPOSED text of
    // a Text and its children, so the sentence reads whole either way — only
    // the absence of a lone first letter proves the initial was suppressed.
    expect(r.queryByText('ا')).toBeNull();
  });

  it('a private note is the owner’s alone', () => {
    // A review is present in both, so the section renders either way. Without
    // it, the empty-section guard hides the note for a visitor and this passes
    // no matter what the note's own condition says.
    const withReview = { review: 'Some words.', privateNotes: 'I cried at the top' };
    expect(body({ ...withReview, isOwner: false }).queryByText('I cried at the top')).toBeNull();
    expect(body({ ...withReview, isOwner: true }).getByText('I cried at the top')).toBeTruthy();
  });
});

describe('the viewing chronicle', () => {
  const chronicle = (history: unknown) =>
    render(
      <LogChronicle
        log={{ ...baseLog, review: 'The current one.', viewing_history: history }}
        windowWidth={390}
        chronicleActiveIdx={0}
        onChronicleIdxChange={() => {}}
      />,
    );

  it('is absent until there is a history to show', () => {
    expect(chronicle([]).toJSON()).toBeNull();
    expect(chronicle(null).toJSON()).toBeNull();
    expect(chronicle('not json').toJSON()).toBeNull();
    // Valid JSON that is not a list. `'"hello"'` is the case that matters: it
    // parses, it has a .length, and anything that trusts that goes on to call
    // .map on a string.
    expect(chronicle('{"a":1}').toJSON()).toBeNull();
    expect(chronicle('"hello"').toJSON()).toBeNull();
    expect(chronicle('7').toJSON()).toBeNull();
  });

  it('reads a history stored as a JSON string', () => {
    const r = chronicle(JSON.stringify([{ date: '2024-03-02', rating: 3, review: 'Colder than I remembered.' }]));
    expect(r.getByText(/Colder than I remembered\./)).toBeTruthy();
    expect(r.getByText('◆ FIRST WATCH')).toBeTruthy();
  });

  it('dates a past viewing in the same shape as the record above it', () => {
    const r = chronicle([{ date: '2024-03-02', rating: 3, review: 'x' }]);
    expect(r.getByText('· MAR 2, 2024')).toBeTruthy();
  });

  it('says nothing rather than "Invalid Date"', () => {
    const r = chronicle([{ date: 'whenever', rating: 3, review: 'x' }]);
    expect(r.queryByText(/Invalid/i)).toBeNull();
  });

  it('cleans a past review the same way the current one is cleaned', () => {
    const r = chronicle([{ date: '2024-03-02', rating: 3, review: '<p>Powell &amp; Pressburger</p>' }]);
    expect(r.getByText(/Powell & Pressburger/)).toBeTruthy();
  });
});
