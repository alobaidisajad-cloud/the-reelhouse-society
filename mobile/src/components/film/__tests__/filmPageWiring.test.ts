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

describe('what the scrim must cover, and what it must not', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));
  const tray = code(read(join(FILM, 'FilmActionTray.tsx')));
  const header = code(read(join(FILM, 'FilmScrollHeader.tsx')));
  const stub = code(read(join(FILM, 'FilmStub.tsx')));
  const zOf = (src: string, re = /zIndex:\s*(\d+)/) => Number(re.exec(src)?.[1]);

  /**
   * The floating back sat at 100 — above the tray at 60 AND the stub at 70.
   * Opening the tray left a brass-ringed disc hovering over the scrim, still
   * tappable, offering to leave the film while its actions were open.
   */
  it('the back control does not float above the tray', () => {
    const back = Number(/floatingBack: \{[^}]*zIndex: (\d+)/.exec(layout)?.[1]);
    expect(back).toBeLessThan(zOf(tray));
  });

  it('nor does the header it hands over to', () => {
    expect(zOf(header)).toBeLessThan(zOf(tray));
  });

  it('but the stub does, because it is the handle', () => {
    expect(zOf(stub)).toBeGreaterThan(zOf(tray));
  });
});

describe('a modal that cannot be talked around', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));
  const header = code(read(join(FILM, 'FilmScrollHeader.tsx')));

  /**
   * `accessibilityViewIsModal` is iOS-ONLY. The tray sets it and its own
   * comment claimed the page beneath was hidden — on Android that promise was
   * simply never kept, and TalkBack would read straight through an open tray
   * into the whole page behind it.
   */
  it('hides the page from a screen reader while the tray is open', () => {
    expect(layout).toMatch(/importantForAccessibility=\{trayOpen \? 'no-hide-descendants' : 'auto'\}/);
  });

  it('hides both back controls with it', () => {
    // The scroll view, the floating back, and the header: three siblings, all
    // reachable to TalkBack unless each is hidden.
    expect((layout.match(/importantForAccessibility=\{trayOpen/g) || []).length).toBe(2);
    expect(layout).toMatch(/hiddenFromReader=\{trayOpen\}/);
    expect(header).toMatch(/importantForAccessibility=\{hiddenFromReader/);
  });

  it('leaves a way out INSIDE the region, since the stub is hidden on iOS', () => {
    const tray = read(join(FILM, 'FilmActionTray.tsx'));
    expect(tray).toMatch(/accessibilityLabel="Close film actions"/);
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

describe('nothing was left computing into the void', () => {
  const layout = code(read(join(FILM, 'FilmDetailLayout.tsx')));

  /**
   * The bookmark bounce survived the console's removal by accident: the style
   * was still being computed and had nothing rendering it. A dead animation
   * raises nothing and shows nothing — it just stops moving.
   */
  it('the bookmark bounce is still wired to something that draws it', () => {
    expect(layout).toMatch(/iconStyle: bookmarkAnimStyle/);
  });

  it('and the toggle still drives it', () => {
    expect(layout).toMatch(/handleWatchlistToggled\(\)/);
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
