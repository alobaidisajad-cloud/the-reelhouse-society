// ============================================================
// REELHOUSE MOBILE — NITRATE NOIR DESIGN SYSTEM v3.0
// Exact port of the web CSS custom properties
// ============================================================

export const colors = {
  // ── NITRATE NOIR PALETTE v3.1 — Aged Tungsten ──
  ink: '#0A0906',         // Primary background (deeper warm brown-black)
  parchment: '#E8DFD0',   // Primary text (yellowed, like actual old paper)
  sepia: '#B8891A',       // Tarnished brass — buttons, links, active state
  soot: '#0D0C08',        // Secondary dark surface (deeper warmth)
  flicker: '#F0E8B0',     // Candlelight accent — hover states, highlights
  bloodReel: '#6B1A0A',   // Deep crimson — destructive actions, stamps
  danger: '#E74C3C',      // Alert red
  ash: '#2A2118',         // Borders, dividers, subtle backgrounds
  bone: '#C2B492',        // Secondary text (more weathered)
  // 6.68:1 on ink at full opacity. The 4.62 this comment used to claim was the
  // ratio of the PREVIOUS fog (#82786B, = 4.60); brightening it left the number
  // behind. It matters because fog is nearly always drawn at partial opacity and
  // that headroom is what the opacity budget spends: 0.80 -> 4.59 (clears AA),
  // 0.65 -> 3.38, 0.60 -> 3.04, 0.45 -> 2.18, 0.30 -> 1.58 (invisible outdoors).
  fog: '#9E9488',         // Muted text, disabled
  silverNitrate: '#D8E0E8', // System/info accent
  rust: '#8B4513',           // Tarnished copper — dossier accents, warm highlights
  // The dark INSIDE a frame — the member's mounted portrait, the three panels of
  // the triptych, the small poster wells in the LATELY ledger. It has to be a
  // clear step above `ink` so an empty frame reads as a frame rather than a hole
  // punched in the page; `soot` is only three values off ink and disappears
  // against it, which is why this is its own shade and not a reuse.
  frame: '#14100B',

  // Derived — channels MUST match base `sepia` (#B8891A = rgb(184, 137, 26)).
  // (CONST-1: previously rgb(196,150,26), a subtly different hue than the base.)
  transparent: 'transparent',
  sepiaFaint: 'rgba(184, 137, 26, 0.08)',
  sepiaSubtle: 'rgba(184, 137, 26, 0.15)',
  sepiaBorder: 'rgba(184, 137, 26, 0.25)',
  // The 0.35 step of the same ramp, for a warm glow BEHIND text rather than a
  // border around something. `selection` happens to carry the same value, but
  // it means "highlight over selected text" and every other use of it is a
  // TextInput's selectionColor — so a title's textShadow reading from it was a
  // value that matched and a name that lied.
  sepiaGlow: 'rgba(184, 137, 26, 0.35)',
  sepiaBorderStrong: 'rgba(184, 137, 26, 0.5)',
  sepiaBorderBold: 'rgba(184, 137, 26, 0.8)',
  bloodFaint: 'rgba(107, 26, 10, 0.3)',
  // Auteur crimson — the single bright red for dark surfaces. Replaces the
  // drifted rgb(125,31,31) / rgb(180,45,45) duo so every red in the app is
  // either bloodReel (deep stamp) or crimson (legible accent).
  crimson: '#B42D2D',
  crimsonBorder: 'rgba(180, 45, 45, 0.3)',
  crimsonFaint: 'rgba(180, 45, 45, 0.1)',
  parchmentBright: '#F8F2E4',
  surface: '#14120D',
  /**
   * A sheet raised OVER the page, lit by the room rather than the page behind
   * it — the film page's action tray. A hair above `ink` and a hair below
   * `surface`: enough to read as a separate plane against the scrim, not
   * enough to read as a grey card.
   */
  surfaceRaised: '#12100B',
  // Text-selection highlight — brand sepia at low alpha so selected text stays legible
  selection: 'rgba(184, 137, 26, 0.35)',
  // ── Semantic ──
  validation: '#5B8C3E', // Archive-approved green — form validation only
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

  // Two more the log surfaces were still mixing by hand. Same rule as above:
  // the values are EXACTLY what shipped, so naming them changes nothing on
  // screen — it only stops the next person guessing at them again.
  inkwell: '#050403',       // the recess UNDER the paper — deck bars, the chronicle
                            // strip, the critique field. Darker than ink on purpose:
                            // these are cut into the page, not laid on it.
  // The black behind a MISSING poster — the hole in the wall where a picture
  // is not. Mixed by hand in three places (the poster card, the vault case, the
  // ledger plate) and now named, at exactly the value that ships.
  // ⚠ One point of blue from `inkwell` (#050403). They are almost certainly the
  // same shade and want merging — but that is a pixel change, and this pass
  // promised not to make one silently. Flagged here for a colour pass.
  posterVoid: '#050402',

  tarnishDeep: '#5A430D',   // brass in shadow — the closing stop of a brass gradient.
                            // `sepia → this` was written out by hand in both autopsy
                            // gauges; using tarnish instead flattens the ramp that
                            // makes the fill read as curved metal.
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
  // ── The endgame lock ─────────────────────────────────────────────────────
  // ui / uiMedium / uiBold / mono (Inter + system Courier) are GONE. The whole
  // app speaks the house voice — Rye, Special Elite, Courier Prime, Spectral —
  // and any future `fonts.ui` is now a COMPILE ERROR, not a silent design
  // regression. That is the point: the drift the marathon swept out can never
  // return through this door.
} as const;

/**
 * ── THE TYPE SCALE ───────────────────────────────────────────────────────────
 * Sizes by ROLE, not by number.
 *
 * The six profile rooms had TWENTY distinct font sizes across fifty-five
 * declarations. That is not a scale, it is twenty separate decisions — and two
 * of them had quietly inverted the hierarchy of the room they were in:
 *
 *   · The Ledger exists to show what a member WROTE, and set their words at
 *     11.5 under a film title at 14.5. The smallest thing in the row was the
 *     only thing the room was for.
 *   · The Archive's month rail set the YEAR at 13 in the display face and the
 *     MONTH at 8.5. Within one archive the year repeats across twelve rails;
 *     the month is what tells them apart. The repeated token was the loud one.
 *
 * Neither is fixable by nudging a number, because nothing stops the next
 * twenty. Naming the role is what makes size follow meaning — the same move
 * that gave the rooms one page inset (ROOM_INSET), one rank ladder
 * (STANDING_LADDER) and one search box (RoomSearch).
 *
 * A size is NOT a hierarchy on its own. `voice` sits one point under `title`
 * and stays clearly subordinate to it, because they differ in face (Courier
 * Prime Italic against Rye) and in colour (bone against parchment). Making the
 * words tiny was never what separated them.
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
  /** A chip, an eyebrow: ALL, RECENT, STANDING. */
  label: 10,
  /** The caption UNDER a value: LONGEST RUN. Small on purpose. */
  caption: 8.5,
  /** A corner badge whose meaning is already on screen: BD, RANKED. */
  badge: 7.5,
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
  shadowSurfaceHover: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.8,
    shadowRadius: 36,
    elevation: 15,
  },
  shadowPrimary: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 8,
  },
  
  // Outer glows for cards and interactive inputs
  glowSepia: {
    shadowColor: colors.sepia,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 5,
  },
  glowFlicker: {
    shadowColor: colors.flicker,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
    elevation: 6,
  },

  // Text glows 
  textGlowSepia: {
    textShadowColor: 'rgba(196, 150, 26, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  textGlowFlicker: {
    textShadowColor: 'rgba(248, 240, 192, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },
  textShadowDeep: {
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  }
} as const;

/** Warm sepia-toned blurhash — universal placeholder while images load */
export const SEPIA_HASH = 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.';

export const typography = {
  jumbo: { fontSize: 56, lineHeight: 60, fontFamily: fonts.display, letterSpacing: 1.12 },
  h1: { fontSize: 40, lineHeight: 46, fontFamily: fonts.display, letterSpacing: 0.8 },
  h2: { fontSize: 28, lineHeight: 32, fontFamily: fonts.display, letterSpacing: 0.56 },
  h3: { fontSize: 22, lineHeight: 26, fontFamily: fonts.display, letterSpacing: 0.44 },
  lg: { fontSize: 16, lineHeight: 26, fontFamily: fonts.body },
  sub: { fontSize: 12, lineHeight: 18, fontFamily: fonts.sub, letterSpacing: 0.6 },
  body: { fontSize: 14, lineHeight: 24, fontFamily: fonts.body },
  bodyBold: { fontSize: 14, lineHeight: 24, fontFamily: fonts.bodyBold },
  caption: { fontSize: 10, lineHeight: 15, fontFamily: fonts.body },
  micro: { fontSize: 8, lineHeight: 12, fontFamily: fonts.sub, letterSpacing: 2 },
  label: { fontSize: 9, lineHeight: 12, fontFamily: fonts.sub, letterSpacing: 3, textTransform: 'uppercase' as const },
} as const;

export const metrics = {
  headerHeight: 64,
  bottomNavHeight: 80,
  screenWidth: 0,
  /**
   * ── HOW MUCH SCREEN THE BACKDROP RESERVES ─────────────────────────────────
   * 0.65 was two thirds of the phone spent on a decorative still before the
   * film's own title. With the six-control console gone from beneath the hero
   * there is no longer anything to justify it: the reservation drops and the
   * poster rises INTO the image rather than sitting below it, which is both
   * shorter and better — a poster mounted on its own backdrop rather than
   * stacked under one.
   */
  backdropHeightRatio: 0.52,
  /** How far the poster climbs into that reservation. Was 80. */
  posterLift: 190,
} as const;

export const physics = {
  springStiff: { damping: 20, stiffness: 200, mass: 1 },
  springBouncy: { damping: 10, stiffness: 100, mass: 1 },
  haptics: { heavyTriggerThreshold: -80, resetThreshold: -20 },
  spooler: {
    rotInputMax: -120,
    rotOutputMax: 360,
    scaleInputMax: -80,
    opacityInputRange: [-30, -70] as const,
    translateY: 100
  }
} as const;
