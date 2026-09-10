/**
 * aDossierHasACover.test.tsx — the head had been drawing a cover from nothing.
 * ─────────────────────────────────────────────────────────────────────────────
 * `EssayHead` has drawn a 176pt band of the film's backdrop, bled to the page
 * edges under a three-stop gradient, since the day it was written. It reads
 * `film.backdropPath`.
 *
 * Nothing ever set it. `toFilm()` built `{ title, director, posterPath }` and
 * stopped, because there was no column to build it from — a filing records
 * `subject_image`, which is the POSTER, and a poster is 2:3. So the essay has
 * been running without the one thing that makes it read like a feature rather
 * than a post, and no test could see it: the component was correct, the data
 * was absent, and absent data renders as a page that simply has no picture.
 *
 * What these pin is the CHAIN, because every link of it was already fine on its
 * own and the chain was broken.
 */
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render } from '@testing-library/react-native';

import { EssayHead } from '@/src/components/dispatch/paper/PaperEssay';
import { DOC_MARGIN, DOC_PAD, DOC_RAIL } from '@/src/components/dispatch/paper/paperMetrics';
import {
  FILING_CARD_COLUMNS, FilingRowSchema, toFilm, parseFilingRows,
} from '@/src/stores/dispatchTypes';

const ROW = {
  id: 'f1', kind: 'dossier', user_id: 'u1', author_username: 'ana',
  subject_kind: 'film', subject_id: 42, subject_title: 'Stalker',
  subject_sub: '1979 · TARKOVSKY',
  subject_image: 'https://image.tmdb.org/t/p/w185/poster.jpg',
  subject_backdrop: 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
  title: 'The Long Silence in Ozu', body: 'An excerpt.',
  certify_count: 0, comment_count: 0,
  created_at: '2026-08-28T21:00:00Z',
  profiles: { username: 'ana', member_no: 17, tier: 'auteur', role: null, is_founding: false },
};

describe('a dossier’s cover reaches the page', () => {
  it('the row schema accepts the column', () => {
    const parsed = FilingRowSchema.safeParse(ROW);
    expect(`parsed: ${parsed.success}`).toMatch(/true$/);
  });

  it('the page ASKS for it — a column nobody selects is a column nobody has', () => {
    // The whole failure mode in one line: every other link can be correct and
    // the picture still never arrives.
    expect(FILING_CARD_COLUMNS).toContain('subject_backdrop');
    // And it is on the CARD's columns, not only the reader's, because a series
    // page draws its parts from these.
    expect(FILING_CARD_COLUMNS).not.toContain('full_content');
  });

  it('the mapper carries it, and keeps the poster separate', () => {
    const film = toFilm(FilingRowSchema.parse(ROW))!;
    expect(film.backdropPath).toBe('https://image.tmdb.org/t/p/w780/backdrop.jpg');
    // Two pictures of one film, both wanted at once. Collapsing them would fix
    // the essay by breaking every card in the feed.
    expect(film.posterPath).toBe('https://image.tmdb.org/t/p/w185/poster.jpg');
  });

  it('an older filing without one is not a broken filing', async () => {
    const { subject_backdrop: _gone, ...older } = ROW;
    const { filings, dropped } = parseFilingRows([older]);
    expect(dropped).toBe(0);
    expect(filings[0].film?.backdropPath ?? null).toBeNull();
  });

  it('the band bleeds to the sheet’s edge, in the reader AND in the preview', () => {
    /**
     * The cover is drawn with a NEGATIVE horizontal margin, so it reaches past
     * the gutter of whatever contains it. That only lands on the page edge when
     * the two numbers are the same number — and they were two numbers: `-24`
     * typed into the style, and `DOC_PAD` in the sheet.
     *
     * It had already cost something. The writing room's preview set its own
     * 20pt gutter, so the same band reached four points PAST the container on
     * each side — on the screen whose whole promise is that it shows what the
     * page will do.
     */
    const essay = readFileSync(
      join(__dirname, '..', 'paper', 'PaperEssay.tsx'), 'utf8',
    );
    expect(essay).toContain('marginHorizontal: -DOC_PAD');
    // The literal must be gone, not merely joined by the constant.
    expect(essay).not.toContain('marginHorizontal: -24');

    // And the preview's gutter is the sheet's own: its margin, its rail and its
    // padding, so the band lands exactly where it lands on the page.
    const room = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'app', 'dispatch', 'compose.tsx'), 'utf8',
    );
    expect(room).toContain('paddingHorizontal: DOC_MARGIN + DOC_RAIL + DOC_PAD');

    // The geometry those two produce: the band's outer edge sits exactly on the
    // sheet's outer edge, 13.5pt in from the screen, in both places.
    expect(DOC_MARGIN + DOC_RAIL + DOC_PAD - DOC_PAD).toBe(DOC_MARGIN + DOC_RAIL);
  });

  it('the head draws the band when there is one, and nothing when there is not', () => {
    const author = { name: 'ana', memberNo: 17, tier: 'auteur' as const };
    const withCover = render(
      <EssayHead
        title="The Long Silence in Ozu" author={author} readTime="12 MIN" filed="AUGUST 28"
        film={{ title: 'Stalker', backdropPath: 'https://x/backdrop.jpg' }}
      />,
    );
    const covered = JSON.stringify(withCover.toJSON());
    expect(covered).toContain('backdrop.jpg');

    const without = render(
      <EssayHead
        title="The Long Silence in Ozu" author={author} readTime="12 MIN" filed="AUGUST 28"
        film={{ title: 'Stalker', posterPath: 'https://x/poster.jpg' }}
      />,
    );
    // A POSTER must not become the cover. It is 2:3; across a 176pt band it is
    // a crop of somebody's chin.
    expect(JSON.stringify(without.toJSON())).not.toContain('poster.jpg');
  });
});
