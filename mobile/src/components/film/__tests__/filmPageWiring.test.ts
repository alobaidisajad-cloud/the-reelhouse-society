/**
 * The film page, checked where a render cannot reach.
 *
 * Three of these read the SOURCE rather than a tree. That is deliberate and
 * limited to claims a render genuinely cannot make: that a fade reaches zero,
 * that a retired component is gone from the page rather than merely unrendered
 * in one state, and that no component on this page reaches for `Intl`.
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const FILM = join(__dirname, '..');
const HOOKS = join(__dirname, '..', '..', '..', 'hooks');
const read = (p: string) => readFileSync(p, 'utf8');

/** Comments quote the very strings these assertions look for. */
const code = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

describe('the backdrop stops following you down the page', () => {
  const anim = code(read(join(HOOKS, 'useFilmAnimations.ts')));

  /**
   * It used to settle at 0.3 and STOP, so a photograph sat behind the synopsis,
   * the provider chips, the ledger and every critique for the whole scroll —
   * body text at reduced contrast over a picture, permanently.
   */
  it('fades to zero, not to a third', () => {
    expect(anim).toMatch(/\[1,\s*0\]/);
    expect(anim).not.toMatch(/\[1,\s*0\.3\]/);
  });

  it('completes the fade within the backdrop, not somewhere past it', () => {
    expect(anim).toMatch(/backdropHeight \* 0\.85/);
  });

  it('still parallaxes — the atmosphere is not what was wrong', () => {
    expect(anim).toMatch(/translateY/);
    expect(anim).toMatch(/backdropHeight \* 0\.4/);
  });
});

describe('the header takes over from the floating back button', () => {
  const anim = code(read(join(HOOKS, 'useFilmAnimations.ts')));

  it('is the exact inverse, over the same fifty points', () => {
    // Both are computed from the same clamp, so they cannot drift apart and
    // leave a scroll position with no way back on screen at all.
    expect(anim).toMatch(/scrollHeaderStyle/);
    const immersive = anim.slice(anim.indexOf('immersiveAnimatedStyle'));
    const header = anim.slice(anim.indexOf('scrollHeaderStyle'));
    expect(immersive).toMatch(/\[1, 0\]/);
    expect(header).toMatch(/\[0, 1\]/);
    expect(header).toMatch(/scrollY\.value - backdropHeight/);
  });
});

describe('what the page retired', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));

  it('no longer mounts the six-control console', () => {
    expect(layout).not.toMatch(/<FilmActionRow/);
    expect(layout).not.toMatch(/from '@\/src\/components\/film\/FilmActionRow'/);
  });

  it('no longer mounts the two-logo studio rail', () => {
    expect(layout).not.toMatch(/<FilmStudios/);
  });

  it('no longer mounts the international-releases rail', () => {
    // Its one fact a member wants — the certificate — moved to the particulars.
    expect(layout).not.toMatch(/<CountryReleases/);
  });

  it('mounts the stub and its tray instead', () => {
    expect(layout).toMatch(/<FilmStub/);
    expect(layout).toMatch(/<FilmActionTray/);
    expect(layout).toMatch(/<FilmScrollHeader/);
  });

  /**
   * Deleted, not merely unmounted. A component that still compiles is one an
   * import away from coming back — and a second way to log a film would be a
   * second answer to a question this page now has one answer for.
   */
  it.each(['FilmActionRow.tsx', 'FilmStudios.tsx', 'CountryReleases.tsx'])(
    '%s is gone from the tree, not just from the page',
    (file) => {
      expect(existsSync(join(FILM, file))).toBe(false);
    },
  );
});

describe('the order of the page', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));
  const at = (needle: string) => layout.indexOf(needle);

  it('puts YOURS above the house, and both above the credit', () => {
    expect(at('label="YOURS"')).toBeGreaterThan(-1);
    expect(at('label="YOURS"')).toBeLessThan(at('<FilmReviews'));
    expect(at('<FilmReviews')).toBeLessThan(at('DIRECTED BY'));
  });

  it('puts the house above the utility sections, not below the videos', () => {
    expect(at('<FilmReviews')).toBeLessThan(at('<WatchProviders'));
    expect(at('<FilmReviews')).toBeLessThan(at('<FilmDossier'));
    expect(at('<FilmReviews')).toBeLessThan(at('<FilmMediaCarousel'));
  });

  it('gives the house more air than the utility sections around it', () => {
    expect(layout).toMatch(/societyAir/);
    expect(layout).toMatch(/marginBottom: 44/);
  });
});

describe('the stub stays put when the tray is up', () => {
  /**
   * The bug this pins: the tray layer sits at 60 and the dock sat at 40, so
   * opening the tray PAINTED OVER the handle that raised it. The control
   * vanished, the chevron never flipped, and the scrim became the only way
   * out — which is the opposite of what the whole design promises.
   */
  it('the dock outranks the tray layer', () => {
    const stub = code(read(join(FILM, 'FilmStub.tsx')));
    const tray = code(read(join(FILM, 'FilmActionTray.tsx')));
    const zOf = (src: string) => Number(/zIndex:\s*(\d+)/.exec(src)?.[1]);
    expect(zOf(stub)).toBeGreaterThan(zOf(tray));
  });
});

describe('the page must not scroll behind an open tray', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));
  it('freezes its own scroll, which a Modal would have done for it', () => {
    expect(layout).toMatch(/scrollEnabled=\{!trayOpen\}/);
  });
});

describe('nothing on this page reaches for Intl', () => {
  /**
   * Hermes may ship without Intl, and `toLocaleDateString` then fails on
   * exactly one platform, silently. Dates are formatted by the page's own
   * helpers and handed down as strings.
   */
  it.each([
    'FilmStub.tsx', 'FilmActionTray.tsx', 'FilmScrollHeader.tsx',
    'FilmDossier.tsx', 'FilmHero.tsx', 'FilmDetailLayout.tsx',
  ])('%s', (file) => {
    const src = code(read(join(FILM, file)));
    expect(src).not.toMatch(/toLocaleDateString|toLocaleString|Intl\./);
  });
});

describe('the trailer row opens a trailer', () => {
  const route = code(read(join(__dirname, '..', '..', '..', '..', 'app', 'film', '[id].tsx')));

  it('no longer falls through to any video at all', () => {
    // It used to end `|| videos[0]`, so a film with only press-junket
    // featurettes showed a control promising a trailer and played an interview.
    expect(route).not.toMatch(/teaser \|\| videos\[0\]/);
    expect(route).toMatch(/anyTrailer \|\| teaser \|\| null/);
  });
});
