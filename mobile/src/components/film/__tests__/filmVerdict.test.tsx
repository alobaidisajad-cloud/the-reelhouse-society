/**
 * THE RATING AMBIGUITY — the page's worst untruth, and the guard that keeps it
 * closed.
 *
 * The film page used to draw FOUR BRASS REELS — the house's own language, used
 * nowhere else in the app but the Ledger and the critiques — for TMDB's score,
 * with `2,317 GLOBAL` printed beside them. A member could not tell whose
 * verdict either one was.
 *
 * The rule now, pinned here: FACTS live in the meta line, VERDICTS wear reels,
 * and the reels appear only when the house itself has spoken.
 */
import React from 'react';
import { render } from '@testing-library/react-native';
import { FilmHero } from '../FilmHero';
import { Check } from 'lucide-react-native';

const STATUS = { watched: { text: 'WATCHED', Icon: Check } };

const film = {
  id: 1,
  title: 'The Odyssey',
  tagline: 'Defy the gods.',
  runtime: 173,
  release_date: '2026-07-15',
  vote_average: 8.0,
  vote_count: 2317,
  genres: [{ id: 1, name: 'Adventure' }, { id: 2, name: 'Action' }],
  production_countries: [{ iso_3166_1: 'GB' }],
  poster_path: '/p.jpg',
} as never;

const base = {
  film,
  reviews: [],
  existingLog: null,
  score: 26,
  studios: [],
  verdict: null,
  posterGlowStyle: { opacity: 1 },
  statusConfig: STATUS as never,
};

const json = (t: ReturnType<typeof render>) => JSON.stringify(t.toJSON());

/**
 * A reel is a bundled PNG — `rating-full`, `-half`, `-empty` — NOT an svg.
 *
 * The first version of this helper counted `RNSVGCircle`, which is zero for a
 * reel rail and zero for no reel rail. Both the "draws reels" and the "draws no
 * reels" assertions would have agreed with each other while measuring nothing:
 * a guard that cannot fail is worse than no guard, because it reads as cover.
 */
const reelCount = (t: ReturnType<typeof render>) => (json(t).match(/rating-(full|half|empty)\.png/g) || []).length;

describe('the reels belong to the house and nobody else', () => {
  it('the detector actually detects a reel', () => {
    // Proving the instrument before trusting a zero from it — the previous
    // version of this helper returned 0 for everything.
    const withReels = render(<FilmHero {...base} verdict={{ avg_rating: 4, rating_count: 9, log_count: 9 }} />);
    expect(reelCount(withReels)).toBeGreaterThan(0);
  });

  it('draws NO reels when the house has not spoken', () => {
    const t = render(<FilmHero {...base} />);
    expect(reelCount(t)).toBe(0);
  });

  it('says so out loud instead of leaving a gap', () => {
    const t = render(<FilmHero {...base} />);
    expect(t.getByText('THE HOUSE HAS NOT SPOKEN')).toBeTruthy();
  });

  it('draws them once the house HAS spoken, and names whose they are', () => {
    const t = render(<FilmHero {...base} verdict={{ avg_rating: 4.5, rating_count: 30, log_count: 37 }} />);
    expect(reelCount(t)).toBeGreaterThan(0);
    expect(t.getByText('4.5')).toBeTruthy();
    expect(t.getByText(/THE HOUSE · 37 LOGS/)).toBeTruthy();
  });

  it('counts one log as a LOG, not LOGS', () => {
    const t = render(<FilmHero {...base} verdict={{ avg_rating: 5, rating_count: 1, log_count: 1 }} />);
    expect(t.getByText(/THE HOUSE · 1 LOG$/)).toBeTruthy();
  });

  /**
   * A film everybody logged and nobody rated has no verdict. Zero is a number
   * and would draw as a verdict of no reels; the absence has to stay an absence.
   */
  it('treats a null average as silence, however many logs there are', () => {
    const t = render(<FilmHero {...base} verdict={{ avg_rating: null, rating_count: 0, log_count: 412 }} />);
    expect(reelCount(t)).toBe(0);
    expect(t.getByText('THE HOUSE HAS NOT SPOKEN')).toBeTruthy();
  });
});

describe("TMDB's score is a particular, not a verdict", () => {
  it('sits in the meta line with the runtime and the year, plainly labelled', () => {
    const t = render(<FilmHero {...base} />);
    expect(t.getByText(/TMDB 8\.0/)).toBeTruthy();
  });

  it('never wears reels, even when the house is silent', () => {
    const t = render(<FilmHero {...base} />);
    expect(reelCount(t)).toBe(0);
  });

  it('is absent entirely when TMDB has no score either', () => {
    const t = render(<FilmHero {...base} film={{ ...(film as object), vote_average: 0 } as never} />);
    expect(t.queryByText(/TMDB/)).toBeNull();
  });

  it('has stopped printing a global vote count beside the reels', () => {
    const t = render(<FilmHero {...base} />);
    expect(json(t)).not.toContain('GLOBAL');
    expect(json(t)).not.toContain('AWAITING RATINGS');
  });
});

describe('the meta reads as two kinds of fact', () => {
  it('puts the genres on their own line, not welded to the runtime', () => {
    // Merged, the only divider was a space and it read as "FANTASY 2H 53M".
    const t = render(<FilmHero {...base} />);
    expect(t.getByText('ADVENTURE  ·  ACTION')).toBeTruthy();
    expect(t.getByText(/2H 53M/)).toBeTruthy();
  });

  it('caps each line so neither can wrap into the other', () => {
    const t = render(<FilmHero {...base} />);
    expect(t.getByText('ADVENTURE  ·  ACTION').props.numberOfLines).toBe(1);
  });

  it('has no bordered genre chips left', () => {
    // Three pieces of chrome around three words, on a page whose whole revision
    // was about removing exactly that.
    const t = render(<FilmHero {...base} />);
    expect(t.queryByText('Adventure')).toBeNull();
  });
});

describe('the rarity stamp, only where it means something', () => {
  it('is absent at a score that reads KNOWN', () => {
    const t = render(<FilmHero {...base} score={26} />);
    expect(t.queryByText('KNOWN')).toBeNull();
  });

  it('appears for a genuinely obscure film — the archive-diving case', () => {
    expect(render(<FilmHero {...base} score={55} />).getByText('INDIE')).toBeTruthy();
    expect(render(<FilmHero {...base} score={70} />).getByText('DEEP CUT')).toBeTruthy();
    expect(render(<FilmHero {...base} score={90} />).getByText('GHOST REEL')).toBeTruthy();
  });

  it('is absent at MAINSTREAM too, not just KNOWN', () => {
    expect(render(<FilmHero {...base} score={10} />).queryByText('MAINSTREAM')).toBeNull();
  });
});
