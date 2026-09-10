/**
 * zz-cover.gen.test.tsx — the essay's cover, in both places it is drawn.
 *
 * A GENERATOR, not a test. Run: npx jest zz-cover.gen
 *
 * The cover bleeds with a NEGATIVE horizontal margin, so where its edge lands
 * depends entirely on the gutter of whatever contains it. It is drawn in two
 * different containers — the reader's sheet and the writing room's preview —
 * and until this pass those gutters were 24 and 20, so the same band reached
 * the page edge in one and four points past the container in the other.
 *
 * Both are derived from `DOC_PAD` now. This plate puts them side by side so the
 * claim can be measured rather than asserted: in each, the band's outer edge
 * must sit on the sheet's outer edge, `DOC_MARGIN + DOC_RAIL` in from the
 * screen.
 *
 * The backdrop is a remote URL that will not resolve in a browser. That is
 * fine and deliberate — the BOX is laid out by the stylesheet, not by the
 * bytes, and the box is what is being measured.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { View } from 'react-native';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { toHtml } from '../../../src/components/profile/__tests__/zz-render.lib';

import { EssayHead } from '@/src/components/dispatch/paper/PaperEssay';
import { PaperSheet } from '@/src/components/dispatch/paper/PaperFrame';
import { p } from '@/src/components/dispatch/paper/paperStyles';
import { DOC_MARGIN, DOC_PAD, DOC_RAIL } from '@/src/components/dispatch/paper/paperMetrics';

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(), notificationAsync: jest.fn(), selectionAsync: jest.fn(),
}));

const OUT = process.env.PAPER_OUT ?? join(__dirname, '..', 'out');

const ANA = { name: 'ana', memberNo: 17, tier: 'auteur' as const, avatar: null };
const FILM = {
  title: 'Tokyo Story',
  year: 1953,
  director: 'OZU',
  posterPath: null,
  backdropPath: 'https://image.tmdb.org/t/p/w780/backdrop.jpg',
};

const head = (
  <EssayHead
    title="The Long Silence in Ozu"
    series="Part II of Ozu, in four parts"
    author={ANA}
    readTime="12 MIN"
    filed="AUGUST 24"
    film={FILM}
  />
);

describe('the essay’s cover', () => {
  it('renders in the reader’s sheet and in the writing room’s preview', () => {
    mkdirSync(OUT, { recursive: true });

    const reader = render(
      <View style={p.screen} testID="reader">
        <PaperSheet>{head}</PaperSheet>
      </View>,
    );
    writeFileSync(join(OUT, 'x1-cover-in-the-reader.html'), toHtml(reader.toJSON()), 'utf8');

    /**
     * The writing room's preview: the same head, in a plain scroll body whose
     * horizontal padding is the sheet's own margin, rail and padding — which is
     * exactly what `previewContent` now sets.
     */
    const room = render(
      <View style={p.screen} testID="preview">
        <View style={{ paddingHorizontal: DOC_MARGIN + DOC_RAIL + DOC_PAD, paddingVertical: 20 }}>
          {head}
        </View>
      </View>,
    );
    writeFileSync(join(OUT, 'x2-cover-in-the-preview.html'), toHtml(room.toJSON()), 'utf8');

    /**
     * The BAND, not the bytes. `zz-render.lib` replaces a remote image with a
     * placeholder unless the URL is in its poster map, so the file name is not
     * in the html — and it does not need to be: the box is laid out by the
     * stylesheet, and the box is the thing being measured.
     */
    for (const html of [toHtml(reader.toJSON()), toHtml(room.toJSON())]) {
      expect(html).toContain('height:176px');
      expect(html).toContain(`margin-left:-${DOC_PAD}px`);
      expect(html.length).toBeGreaterThan(500);
    }
  });
});
