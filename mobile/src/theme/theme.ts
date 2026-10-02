// ============================================================
// REELHOUSE MOBILE — NITRATE NOIR: the design tokens
// ============================================================

/**
 * THE HOUSE, LIT: five grounds on one warm charcoal, each a clear step from the
 * next (perceived lightness, L*):
 *   recess  1.4   cut INTO the page: poster voids, deck bars, the chronicle
 *   well    3.4   a field you type into, sunk below the card it sits on
 *   house   3.1   the room itself
 *   card    9.2   paper laid on the page
 *   raised 12.7   bars, trays, docks and sheets, lit by the booth
 * A neutral grey with ink's warmth, not ink's channels scaled (which turns olive).
 * Measured: no step bands, and every text tone clears its floor on all five.
 *
 * WORDS ARE NEVER DRAWN SEE-THROUGH. Opacity is for what a word sits on; a quiet
 * tone is a colour of its own, lifted until it clears the lightest ground.
 */
export const colors = {
  ink: '#0D0B09',         // THE HOUSE — the room itself
  parchment: '#E8DFD0',   // Primary text (yellowed, like actual old paper)
  sepia: '#B8891A',       // Tarnished brass — buttons, links, active state
  soot: '#1E1914',        // CARD — paper laid on the page
  /** The card in the Auteur's ink: soot's exact step, a quarter of bloodReel in its hue. */
  sootAuteur: '#2A140D',
  // A sheet over a film, 8% see-through ON PURPOSE so the backdrop tints it (the ladder
  // guard holds these apart from the grounds it makes solid).
  sheetOverArt: 'rgba(13, 11, 9, 0.92)',
  sheetOverArtAuteur: 'rgba(42, 20, 13, 0.92)',
  flicker: '#F0E8B0',     // Candlelight accent — hover states, highlights
  bloodReel: '#6B1A0A',   // Deep crimson — destructive actions, stamps
  danger: '#E74C3C',      // Alert red
  ash: '#2A2118',         // Borders, dividers, subtle backgrounds
  bone: '#C2B492',        // Secondary text (more weathered)
  fog: '#9E9488',         // Muted marks; 6.68:1 on ink (at 0.8: 4.59, at 0.6: 3.04)
  /** The quiet grey for WORDS, solid: 4.64:1 on raised, 5.37 on the house. */
  fogQuiet: '#908980',
  silverNitrate: '#D8E0E8', // System/info accent
  rust: '#8B4513',           // Tarnished copper — dossier accents, warm highlights
  // Inside a frame (portrait, triptych, poster wells): the card step, never a hole.
  frame: '#1E1914',

  // Derived — channels MUST match base `sepia` (#B8891A = rgb(184, 137, 26)).
  transparent: 'transparent',
  sepiaFaint: 'rgba(184, 137, 26, 0.08)',
  sepiaSubtle: 'rgba(184, 137, 26, 0.15)',
  sepiaBorder: 'rgba(184, 137, 26, 0.25)',
  // A glow BEHIND text (`selection` has the value, but means selected text).
  sepiaGlow: 'rgba(184, 137, 26, 0.35)',
  sepiaBorderStrong: 'rgba(184, 137, 26, 0.5)',
  sepiaBorderBold: 'rgba(184, 137, 26, 0.8)',
  bloodFaint: 'rgba(107, 26, 10, 0.3)',
  // The one bright red for marks on dark (bloodReel is the deep stamp).
  crimson: '#B42D2D',
  crimsonBorder: 'rgba(180, 45, 45, 0.3)',
  // Crimson for WORDS: the pigment reads under 2.8:1 as text, this 4.63 on raised.
  crimsonInk: '#E35E58',

  // The Dispatch's kinds: the WORD wears the hue. Brighter than the Darkroom's moods,
  // which are fills. take is vermilion, never the Auteur's crimson; seeking is duplicator
  // violet, a want-ad's ink, the one hue no chrome uses; dossier is silverNitrate.
  dispatchTake: '#DA6840',
  dispatchSeeking: '#A07CBE',
  dispatchWire: '#5FA3B8',
  dispatchBallot: '#6FA855',

  // RAISED: the keyboard rises from the floor, so it is lit like a tray, not cut in.
  keyWell: '#26201A',
  // The ground of an exported story card. Deeper than `ink` because it is seen
  // on someone else's feed, against their app's white, and not in the booth.
  storyGround: '#0B0907',
  crimsonFaint: 'rgba(180, 45, 45, 0.1)',

  // The Auteur stamp's wash, under crimsonFaint's 0.10: no rank may read as a censure.
  stampCrimsonHead: 'rgba(180, 45, 45, 0.09)',
  /** Where the wash lands: the house's own ink, all but opaque. */
  stampGround: 'rgba(13, 11, 9, 0.96)',
  /** The Auteur frame's inner rule, at half, so the two read as one struck pair. */
  stampRuleInner: 'rgba(226, 86, 79, 0.5)',

  parchmentBright: '#F8F2E4',
  /** CARD — the same paper as `soot`, kept as its own name for panels. */
  surface: '#1E1914',
  /** RAISED, the ladder's top step: a tray, sheet or dock, a plane apart from the page. */
  surfaceRaised: '#26201A',
  // Text-selection highlight — brand sepia at low alpha so selected text stays legible
  selection: 'rgba(184, 137, 26, 0.35)',
  // ── Semantic ──
  validation: '#5B8C3E', // Archive-approved green — form validation only
  // The green and the rust as WORDS: each lifted along its own hue until it clears 4.6
  // on raised (as marks they read 4.37 and 2.46 on a card).
  validationInk: '#629743',
  rustInk: '#D76B1D',
  errorBackground: 'rgba(139,26,26,0.1)',
  errorBorder: 'rgba(139,26,26,0.5)',

  // ── The Shade Ledger ──────────────────────────────────────────────────
  // Six shades the app kept mixing by hand across ~15 files — now named.
  // Values are EXACTLY what was already shipping (zero visual change); the
  // color lock (__tests__/colorLock.test.ts) ratchets raw hexes so new
  // drift outside this file fails the suite. Artwork files (logo, Buster,
  // the Darkroom mood table, share-card canvases) are exempt — art is art.
  silverScreen: '#F2ECD8',  // projection-screen cream — display titles on dark chrome
  parchmentDim: '#E4DFCC',  // parchment half a stop down — secondary display text
  champagne: '#C4961A',     // polished brass highlight — glows, active accents
  marqueeGold: '#DCA63A',   // marquee-bulb gold — the brightest brass, sparing use
  tarnish: '#8B6914',       // aged dark brass — tints, muted gold accents
  bloodAged: '#8B1A1A',     // dried blood — legacy deep-red accents (prefer crimson/bloodReel)

  // RECESS: the cut under the paper (deck bars, the chronicle, the critique field).
  inkwell: '#060504',
  /** Behind a MISSING poster: the same recess, named for what it means. */
  posterVoid: '#060504',
  /** WELL: a field you type into, sunk below the card it sits on. */
  well: '#0E0C0A',

  // The Society's tickets: card stock, a warm step above `frame` falling to it; the
  // Auteur's is oxblood stock, a different paper rather than a red outline.
  ticketHead: '#2A241B',
  ticketAuteurHead: '#33170F',
  ticketAuteurFoot: '#1A0F0B',

  tarnishDeep: '#5A430D',   // brass in shadow: a ramp's closing stop (tarnish would flatten it)
  /** Quiet ink on brass, solid: 4.72:1 where the ramp is darkest, 8.43 where brightest. */
  onBrassQuiet: '#1C160A',
} as const;

export const fonts = {
  display: 'Rye_400Regular',       // Bold cinematic western serif — titles
  sub: 'SpecialElite_400Regular',   // Typewriter — subheadings, labels
  body: 'CourierPrime_400Regular',  // Monospace — body text, reviews
  bodyBold: 'CourierPrime_700Bold',
  bodyItalic: 'CourierPrime_400Regular_Italic',
  serif: 'Spectral_400Regular',         // Humanist screen serif — long-read transcript (the Lounge)
  serifMedium: 'Spectral_500Medium',
  serifItalic: 'Spectral_400Regular_Italic',
  // The house voice only: no system or UI face exists here, so none can be reached for.
} as const;

/**
 * Sizes by ROLE, not by number, so size follows meaning: a member's own words
 * are never set smaller than what they are about, and what tells rows apart is
 * never quieter than what repeats across them.
 *
 * A size is not a hierarchy on its own: `voice` sits a point under `title` and
 * stays subordinate by face (Courier Prime Italic against Rye) and colour.
 */
export const type = {
  /** The one number a room is about — the dial's film count. */
  hero: 32,
  /** The standing. One per screen, at most. */
  display: 26,
  /** A figure that has a caption under it: 31, 3.8. */
  value: 18,
  /** A film, a stack. */
  title: 15,
  /** THE MEMBER'S OWN WORDS. Reviews, descriptions — never below this. */
  voice: 14,
  /** A section heading: a month, a shelf. */
  rail: 12,
  /** A secondary sentence, or a live fact worth reading. */
  meta: 11,
  /** A chip, an eyebrow: ALL, RECENT, STANDING. The floor: no role is smaller. */
  label: 10,
} as const;

export type TypeRole = keyof typeof type;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  section: 64,  // --section-gap equivalent
} as const;

export const radii = {
  sm: 3,
  card: 4,
  md: 6,
  lg: 12,
  pill: 9999,
} as const;

// ── THE BOOTH LAW ────────────────────────────────────────────────────────
// All light in the house falls from the projection booth: overhead, warm,
// slightly behind the viewer. Therefore every drop shadow falls DOWNWARD
// (shadowOffset height >= 0) and glows radiate evenly (offset 0,0).
// Blessed exceptions: surfaces that RISE FROM THE FLOOR — bottom sheets and
// the tab bar (logDetailStyles.contentCard, AvatarCropSheet, (tabs)/_layout)
// — lift with a soft UPWARD shadow to separate from the content beneath.
// Any other upward or sideways shadow is drift, not design.

// ── Ultra-Premium Nitrate Effects ──
export const effects = {
  // Deep complex drop shadows simulating web's triple layered box-shadow
  shadowSurface: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 24,
    elevation: 10,
  },
  shadowPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  /**
   * THE SHADOW A SMALL THING KEEPS ON THE LIT HOUSE. On black, the 24pt
   * surface shadow did nothing; on a lit page it is a dark cloud round every
   * chip and tab. A small floating thing keeps a short one, cast straight
   * down — never more than 6pt, never softer than 12 — and anything WIDE casts
   * none: its own tone and the lamp separate it from the page.
   */
  shadowFloat: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 6,
  },
  /**
   * A WIDE thing casts no shadow on the lit house (spread LAST). `elevation` stays:
   * on Android it is also paint order, and a menu would slide under what it opens over.
   */
  flat: {
    shadowColor: 'transparent',
    shadowOpacity: 0,
  },
  // (For a thing that clips its corners, see castOf / liftOf below.)

  // Outer glows for cards and interactive inputs
  glowSepia: {
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },

  // Text glows 
  textGlowSepia: {
    textShadowColor: 'rgba(196, 150, 26, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  textShadowDeep: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  }
} as const;

// A shadow on a thing that clips is two views: iOS casts from a layer that does not clip
// (clipsToBounds draws nothing outside), Android from the painted view's outline.
//   <View style={castOf(s)}><View style={[clipped, liftOf(s)]}>…   (layout.cjs SHADOW checks)
type Shadow = { shadowColor?: string; shadowOffset?: { width: number; height: number }; shadowOpacity?: number; shadowRadius?: number; elevation?: number };
export const castOf = ({ shadowColor, shadowOffset, shadowOpacity, shadowRadius }: Shadow) =>
  ({ shadowColor, shadowOffset, shadowOpacity, shadowRadius });
export const liftOf = ({ elevation }: Shadow) => ({ elevation });

/** Warm sepia-toned blurhash — universal placeholder while images load */
export const SEPIA_HASH = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

export const metrics = {
  /** The film page's backdrop share of the screen; the poster is mounted on it. */
  backdropHeightRatio: 0.52,
  /** How far the poster climbs into the backdrop. */
  posterLift: 190,
} as const;
