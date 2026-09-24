// ============================================================
// REELHOUSE MOBILE — NITRATE NOIR DESIGN SYSTEM v3.0
// Exact port of the web CSS custom properties
// ============================================================

export const colors = {
  /**
   * ── THE HOUSE, LIT — the ground ladder (2026-09-23) ────────────────────────
   *
   * The app used to sit on twelve near-blacks that nobody could tell apart: a
   * card (`soot`) sat 0.8 of a perceived step above the page, so cards read as
   * holes rather than paper, and the "cut into the page" recesses were BELOW a
   * page that was already at the floor. Shadows were black on black — invisible
   * — and the only thing separating one surface from another was a hairline.
   *
   * Five surfaces now, on one warm charcoal, each a clear step from the next
   * (perceived lightness in brackets). Deep where the drama is, lit where the
   * reading is — a dark house with light falling through it, not a flat fill:
   *
   *   recess  1.4   cut INTO the page: poster voids, deck bars, the chronicle
   *   well    3.4   a field you type into, sunk below the card it sits on
   *   house   3.1   the room itself
   *   card    9.2   paper laid on the page
   *   raised 12.7   bars, trays, docks and sheets, lit by the booth
   *
   * The hue is a neutral grey carrying ink's own warmth, NOT ink's channels
   * scaled: scaling multiplies the tint with the light and the ground turns
   * olive. Measured: no step bands (the largest 8-bit step across the light is
   * 1/255), and every text tone clears its contrast floor on all five.
   */
  ink: '#0D0B09',         // THE HOUSE — the room itself (was #0A0906)
  parchment: '#E8DFD0',   // Primary text (yellowed, like actual old paper)
  sepia: '#B8891A',       // Tarnished brass — buttons, links, active state
  soot: '#1E1914',        // CARD — paper laid on the page (was #0D0C08, a hole)
  /**
   * THE CARD, IN THE AUTEUR'S INK — the same paper, tinted.
   *
   * An Auteur's post sits on a crimson card, and it was written by hand in
   * three places and never twice the same: `rgb(12,5,5)` on the feed, the same
   * on the Pulse, `rgba(25,10,10,0.92)` on a log. At L* 1.8 and 4.3 against a
   * card at 9.2, the one surface that marks the app's PAYING members was also
   * the one that still read as a hole punched in the page.
   *
   * Matched to `soot` exactly — same perceived step, the crimson carried in the
   * hue — so every word that clears its floor on a card clears it here too, to
   * the second decimal. A card is still paper; paper the colour of blood is a
   * different object, so the tint is a quarter of `bloodReel` over the card's
   * own warmth rather than the pigment neat.
   */
  sootAuteur: '#2A140D',
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
  /**
   * ── WORDS ARE NEVER DRAWN SEE-THROUGH ─────────────────────────────────────
   * The app's quiet grey was `fog` at 0.8, and that 0.8 was budgeted against the
   * old near-black: 4.59:1, scraping past the 4.5 floor. The same text lands at
   * 4.22 on a card and 3.97 on a raised bar — it fails the moment it sits on
   * anything lit. So the tone becomes a colour of its own, lifted along its own
   * hue until it clears the floor on the LIGHTEST surface it can sit on
   * (4.64 on raised, 5.37 on the house), and no word is painted at partial
   * opacity again: opacity is for the thing a word sits on, never the word.
   */
  fogQuiet: '#908980',
  silverNitrate: '#D8E0E8', // System/info accent
  rust: '#8B4513',           // Tarnished copper — dossier accents, warm highlights
  // The dark INSIDE a frame — the member's mounted portrait, the three panels of
  // the triptych, the small poster wells in the LATELY ledger. An empty frame
  // must read as a frame rather than a hole punched in the page, so it sits on
  // the CARD step: a frame is a thing laid on the wall, not a gap in it.
  frame: '#1E1914',

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
  // ── CRIMSON FOR MARKS, CRIMSON INK FOR WORDS ─────────────────────────────
  // `crimson` as TEXT composites to 2.49:1 on an Auteur's byline and 2.72:1 on
  // a certified count — both far under the 4.5 floor, and both on almost every
  // screen, so the least readable type in the app was the type marking its
  // paying members and its best posts.
  //
  // A fill and a letterform are not the same problem: a filled heart at that
  // size is a shape and reads on any ground, a 7.5pt word does not. So the
  // pigment above stays for marks — rings, filled hearts, a ballot's cross —
  // and words that must be crimson use this, at 5.4:1, unmistakably the same
  // family. The same 2.7:1 label is on the log deck today.
  // Lifted from #E2564F: on a raised bar it read 4.35, under the floor. 4.63 now.
  crimsonInk: '#E35E58',

  // ── THE DISPATCH'S FIVE DEPARTMENTS ──────────────────────────────────────
  // A filing's kind carries a hue, and the WORD wears it — the way a Darkroom
  // mood is itself the colour it filters by, so the name teaches the code the
  // first time you see it and nobody has to decode a stripe.
  //
  // Chosen for distinctness first: red, violet, blue, green, silver. Two notes
  // on why they are not the obvious picks:
  //
  //   take    — was `crimson`, which is EXACTLY the Auteur ring, so a take by
  //             an Auteur printed the same red twice for two unrelated things.
  //             Vermilion leans orange where crimson has equal green and blue,
  //             so the two never read as the same mark.
  //   seeking — was `sepia`, the brass that every rule, hairline, plate rim and
  //             index tick on that page is already made of. A code printed in
  //             the colour of the furniture around it is not a code. Violet is
  //             the one hue no other kind and no piece of chrome uses, and it
  //             is the right one: small ads were run off on a spirit
  //             duplicator, and duplicator ink was violet. A member asking the
  //             house for a film is placing a want-ad.
  //
  // They are brighter than the Darkroom's mood accents on purpose. The first
  // set borrowed those verbatim and was effectively invisible: the Darkroom
  // uses them as fills behind whole cards, where a large dark area is legible.
  // Three points of the same colour against near-black is not.
  //
  // `dossier` is silverNitrate and is written as the token, not a copy of its
  // value — the silver screen, the most considered form.
  // Lifted from #D9633A for the same reason: 4.45 on a raised bar, 4.62 now.
  dispatchTake: '#DA6840',
  dispatchSeeking: '#A07CBE',
  dispatchWire: '#5FA3B8',
  dispatchBallot: '#6FA855',

  // The ground inside a keyboard well — a RAISED surface: the keyboard rises
  // from the floor of the screen, so it is lit like a tray, not cut like a well.
  keyWell: '#26201A',
  // The ground of an exported story card. Deeper than `ink` because it is seen
  // on someone else's feed, against their app's white, and not in the booth.
  storyGround: '#0B0907',
  crimsonFaint: 'rgba(180, 45, 45, 0.1)',

  // ── THE RANK STAMP'S INK ────────────────────────────────────────────────
  // The wash inside a rank mark: the rank's own pigment at low alpha, falling
  // to the page's near-black, so the stamp reads as PRESSED INTO CARD rather
  // than outlined on it. Head and foot of one gradient, per rank.
  //
  // Three things these numbers have to be true about at once, and the first
  // draft got the second one wrong — its crimson head was 0.16:
  //
  //   1. AUTEUR OVER ARCHIVIST. The crimson wash is heavier than the brass, so
  //      the top rank is the stronger impression.
  //   2. CENSURE OVER RANK. Both stay UNDER the 0.10 `crimsonFaint` a WITHHELD
  //      filing wears. A censure is the heaviest crimson field in the app, so a
  //      rank can never read at a glance as the mark of a censured one.
  //   3. LEGIBLE. A lighter wash leaves a darker ground, which is what carries
  //      the pale ink — the two requirements pull the same way, not against.
  //
  // These live in the Ledger rather than in the component for a reason worth
  // writing down: `colorLock` counts HEX literals only. An rgba painted inside
  // a component sails through the ratchet while doing precisely what the
  // ratchet exists to stop.
  // TWO stops, not three. A mid-stop at two percent was very nearly the ground
  // it was heading for, so it changed nothing anyone could see — and its value
  // collided with the tail of the archive feed's tier rule, which `logSurfaces`
  // rightly reported as the theme naming a colour twice. The rim is
  // `sepiaBorderStrong`, which the Ledger already carries and which is exactly
  // what a lighter impression's edge is.
  stampCrimsonHead: 'rgba(180, 45, 45, 0.09)',
  /** Where the wash lands: the house's own ink, all but opaque. */
  stampGround: 'rgba(13, 11, 9, 0.96)',
  /**
   * The INNER rule of the Auteur's double frame — its own ink at half, so the
   * two rules read as one struck pair rather than as a box inside a box. Only
   * the higher rank is framed; that frame is what makes it read as higher.
   */
  stampRuleInner: 'rgba(226, 86, 79, 0.5)',

  parchmentBright: '#F8F2E4',
  /** CARD — the same paper as `soot`, kept as its own name for panels. */
  surface: '#1E1914',
  /**
   * A sheet raised OVER the page, lit by the room rather than the page behind
   * it — the film page's action tray, a bottom sheet, a dock. The top step of
   * the ladder: it must read as a separate plane against the scrim.
   */
  surfaceRaised: '#26201A',
  // Text-selection highlight — brand sepia at low alpha so selected text stays legible
  selection: 'rgba(184, 137, 26, 0.35)',
  // ── Semantic ──
  validation: '#5B8C3E', // Archive-approved green — form validation only
  /**
   * The same green and the same rust as WORDS. `validation` measures 4.37:1 on
   * a card and `rust` 2.46 — fine for a filled bar or a tick, not for a 9pt
   * "VERY STRONG" or "×3". Each lifted along its own hue (all channels scaled
   * together) until it clears 4.6 on raised, the lightest ground: the green by
   * 8%, which is the same green; the rust by 55%, which is the same copper lit.
   */
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

  // Two more the log surfaces were still mixing by hand. Same rule as above:
  // the values are EXACTLY what shipped, so naming them changes nothing on
  // screen — it only stops the next person guessing at them again.
  // RECESS — the cut UNDER the paper: deck bars, the chronicle strip, the
  // critique field. Below the house on purpose; now that the house is lit, a
  // recess finally reads as cut in rather than as more of the same black.
  inkwell: '#060504',
  /**
   * The black behind a MISSING poster — the hole in the wall where a picture is
   * not. It was one point of blue off `inkwell`, a difference nobody could see,
   * and the colour pass this file's old comment asked for is this one: the two
   * are now the same recess, named twice because they mean different things.
   */
  posterVoid: '#060504',
  /**
   * WELL — a field you type into. Sunk below the card it sits on, so a search
   * box or a password field reads as something cut into the surface. It was the
   * house colour with a heavy black drop shadow, which was invisible on black
   * and, once the house was lit, drew a dark halo down both sides of the screen.
   */
  well: '#0E0C0A',

  // ── THE SOCIETY'S TICKETS ────────────────────────────────────────────────
  // An admission ticket is card stock laid on the page, so its head is a warm
  // step above `frame` and falls to it. The Auteur's is oxblood stock — the
  // higher grade is a different paper, not the same paper in a red outline.
  ticketHead: '#2A241B',
  ticketAuteurHead: '#33170F',
  ticketAuteurFoot: '#1A0F0B',

  tarnishDeep: '#5A430D',   // brass in shadow — the closing stop of a brass gradient.
  /**
   * The QUIET ink printed on brass — a gloss under a brass label.
   *
   * It was the house ink at 0.72, which is a word painted see-through, and on
   * brass that costs more than anywhere else: the ramp darkens toward tarnish
   * along its diagonal, and the gloss's last letters sit on rgb(166,124,24),
   * where 0.72 of the ink measured 3.66:1. Even the darkest ink in the app at
   * that opacity only reached 3.88.
   *
   * Solid now: the house ink a fifth of the way toward brass-in-shadow, the
   * lightest such step that clears — 4.72 at that worst point, 8.43 on the
   * brightest brass. The label above it keeps the full ink (5.16 there); the
   * two differ by typeface as much as by tone, which is all brass has room for.
   */
  onBrassQuiet: '#1C160A',
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
