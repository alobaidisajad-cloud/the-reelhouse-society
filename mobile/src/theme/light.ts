/**
 * THE HOUSE, LIT — the light that falls on the ladder.
 * ──────────────────────────────────────────────────────────────────────────
 * The five grounds in theme.ts are the house. This is the light in it. A dark
 * page painted one flat colour reads as a screen; the same page with a lamp
 * over it, corners that fall away and a floor that goes dark reads as a room.
 *
 * Every room has its own lamp — the same ladder everywhere, a different
 * source in the fiction: the marquee bulbs over the Lobby, the projector
 * behind the Reel, a desk lamp hung left of centre over the Dispatch, a
 * reading lamp on a member's file. That is how the app stays one house and
 * still has rooms.
 *
 * The light is painted ONCE, at the screen's root, UNDER the content. Cards
 * and bars are opaque and keep their own tone; the lamp shows on the page
 * between them. (Painting it on inner boxes restarts it at each one and draws
 * a hard seam across the page — found in a mockup, under a profile's buttons.)
 *
 * ── THE LIGHT NEVER OUTSHINES THE INK ─────────────────────────────────────
 * The pool lifts the ground a word sits on. Every word-ink is proven against
 * `surfaceRaised`, the lightest of the five grounds — so no lamp may lift the
 * page above it, at its brightest point, at full strength. The Lobby's lamp
 * was drawn at 0.13 and its crown measured L* 13.9 against raised's 12.7:
 * crimsonInk fell to 4.47 there. It burns at 0.116 — the most it can — and
 * every word-ink keeps at least 4.62. `lightFloor.test.ts` holds all six.
 *
 * Recipe values are the ones the approved mockups were drawn with
 * (session 2026-09-23), carried over exactly except where the line above
 * forced a change.
 */

export type Room = 'lobby' | 'reel' | 'dispatch' | 'film' | 'member' | 'default';

export interface Lamp {
  /** The lamp's colour. Warmer the brighter it burns, like tungsten. */
  rgb: readonly [number, number, number];
  /** Alpha of the light at the pool's centre, over the house. */
  strength: number;
  /** Where it hangs across the screen, 0 (left) to 1 (right). */
  x: number;
}

export const LAMPS: Record<Room, Lamp> = {
  lobby: { rgb: [236, 190, 120], strength: 0.116, x: 0.5 },
  reel: { rgb: [226, 178, 116], strength: 0.10, x: 0.5 },
  dispatch: { rgb: [232, 196, 140], strength: 0.09, x: 0.34 },
  film: { rgb: [222, 176, 112], strength: 0.085, x: 0.5 },
  member: { rgb: [226, 182, 124], strength: 0.10, x: 0.5 },
  default: { rgb: [222, 176, 112], strength: 0.105, x: 0.5 },
};

/**
 * THE POOL — an ellipse wider than the screen and most of its height, the
 * light falling off in four steps. Radii as fractions of the SCREEN: the
 * mockups painted it on the screen's root, one screen tall, with the page
 * scrolling inside — so the lamp hangs in the ROOM and the page slides beneath
 * it, as paper under a desk lamp does.
 *
 * Where a photograph hangs at the top of a screen, the pool hangs from the
 * photograph's HEM instead of the crown (the photo lights its own zone, via
 * its bloom), and burns at 0.8 — so the join between them is never a band.
 */
export const POOL = {
  rx: 1.35,
  ry: 0.64,
  /** [offset, fraction of the lamp's strength] */
  stops: [[0, 1], [0.38, 0.48], [0.62, 0.17], [0.82, 0]] as const,
  /** No hero: the lamp hangs just above the top of the screen. */
  crownY: -0.06,
  /** Strength kept when the pool hangs from a hero's hem. */
  underHero: 0.8,
} as const;

/**
 * THE CORNERS — a booth light's falloff. Wider than the phone and shallow on
 * purpose: at 120% wide and 0.30 black it ran down both long edges and read as
 * a vertical shadow beside every screen. Corners only.
 */
export const CORNERS = {
  cx: 0.5, cy: 0.42, rx: 1.65, ry: 1.08,
  /** [offset, black alpha] */
  stops: [[0.62, 0], [0.86, 0.07], [1, 0.15]] as const,
} as const;

/** THE FLOOR — the foot of the screen goes dark, so a long page is never one tone. */
export const FLOOR = {
  /** [offset down the screen, black alpha] */
  stops: [[0.58, 0], [0.82, 0.12], [1, 0.26]] as const,
} as const;

/**
 * THE BLOOM — a film's own artwork, blurred and nearly colourless, spilling
 * onto the page beneath it: the light in the room comes off the screen.
 *
 * Only from a hero that really hangs at the top of a screen. A poster in the
 * middle of a member's file is not a light source (treating one as one washed
 * a page yellow). Nearly colourless on purpose: a bright poster turned a whole
 * page OLIVE at any real saturation. Light, not a filter.
 */
export const BLOOM = {
  /** Gaussian blur, as a standard deviation in points (CSS blur(70px)). */
  blur: 70,
  saturate: 0.28,
  sepia: 0.25,
  opacity: 0.11,
  /** Drawn 20% oversize so the blur has no hard edge at the sides. */
  scale: 1.2,
  /** How far down the screen it reaches. */
  height: 0.62,
  /** Feathered, never cut: [offset, alpha] of the fade down its height. */
  mask: [[0, 1], [0.42, 1], [0.72, 0.45], [1, 0]] as const,
} as const;

/**
 * THE EDGE — a lit surface catches the light on its top edge, and carries a
 * faint falloff down its face: the booth is above, so the top is brighter.
 * (A black drop shadow is invisible on black; this is what makes a card read
 * as a physical thing on a dark page.)
 */
export const EDGE = {
  highlight: 'rgba(255,226,176,0.075)',
  /** The face's falloff: from this, to nothing at `faceTo` of its height. */
  face: 'rgba(255,230,186,0.04)',
  faceTo: 0.42,
} as const;

/**
 * The edge as a STYLE — spread into any lit surface at least 80×36. React
 * Native's New Architecture draws `boxShadow` (inset included) and
 * `experimental_backgroundImage` natively, so this is the mockup's own CSS,
 * unchanged, with no extra views in the tree. It paints under the surface's
 * children, as a background does.
 */
export const EDGE_LIT = {
  boxShadow: `inset 0px 1px 0px 0px ${EDGE.highlight}`,
  experimental_backgroundImage: `linear-gradient(180deg, ${EDGE.face} 0%, rgba(255,230,186,0) ${EDGE.faceTo * 100}%)`,
} as const;

/**
 * A WASH ON THE LIT HOUSE — a full-bleed gradient with no artwork behind it
 * (a page's own fade, a card's shell, a section's tint) is drawn at this
 * strength. At full, the page fades were OPAQUE and hid the room's light
 * entirely, and the card shells ran each card down to the recess so it read as
 * a hole at its foot. A gradient laid over a picture — a backdrop's scrim, a
 * poster's lighting — is not a wash and keeps its own strength.
 */
export const WASH = { opacity: 0.35 } as const;

/**
 * THE LIGHT, LAID OUT — every number the room's light is drawn with, for one
 * screen. It is drawn in three places: the room itself (SVG), the copy a
 * photograph's veil carries (Skia, because it must hold still while the page
 * scrolls), and the design renderer's proofs. All three read it from here, so
 * they cannot disagree about where the lamp hangs or how bright it burns.
 *
 * `hem`: where a photograph hanging at the top of the screen ends, if one does.
 */
export interface LightGeometry {
  pool: { cx: number; cy: number; rx: number; ry: number; rgb: readonly [number, number, number]; stops: [at: number, alpha: number][] };
  floor: { height: number; stops: readonly (readonly [number, number])[] };
  corners: { cx: number; cy: number; rx: number; ry: number; stops: readonly (readonly [number, number])[] };
  bloom: { width: number; height: number; left: number };
}

export function lightGeometry(room: Room, W: number, H: number, hem?: number): LightGeometry {
  const lamp = LAMPS[room];
  const underHero = typeof hem === 'number';
  const strength = underHero ? lamp.strength * POOL.underHero : lamp.strength;
  const bw = W * BLOOM.scale;
  return {
    pool: {
      cx: lamp.x * W,
      cy: underHero ? hem : POOL.crownY * H,
      rx: POOL.rx * W,
      ry: POOL.ry * H,
      rgb: lamp.rgb,
      stops: POOL.stops.map(([at, f]) => [at, +(strength * f).toFixed(4)]),
    },
    floor: { height: H, stops: FLOOR.stops },
    corners: { cx: CORNERS.cx * W, cy: CORNERS.cy * H, rx: CORNERS.rx * W, ry: CORNERS.ry * H, stops: CORNERS.stops },
    // 20% oversize, centred, so the blur never shows an edge at the sides.
    bloom: { width: bw, height: BLOOM.height * H, left: -(bw - W) / 2 },
  };
}

/**
 * The bloom's colour, as a 4×5 matrix: CSS `saturate(s)` then `sepia(a)`,
 * composed — the exact filter the approved mockups were drawn with, in the
 * form a native colour filter takes.
 */
export function bloomMatrix(s = BLOOM.saturate, a = BLOOM.sepia): number[] {
  const sat = [
    0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s,
    0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s,
  ];
  const k = 1 - a;
  const sep = [
    0.393 + 0.607 * k, 0.769 - 0.769 * k, 0.189 - 0.189 * k,
    0.349 - 0.349 * k, 0.686 + 0.314 * k, 0.168 - 0.168 * k,
    0.272 - 0.272 * k, 0.534 - 0.534 * k, 0.131 + 0.869 * k,
  ];
  // sepia · saturate: the colour is desaturated first, then warmed
  const m: number[] = [];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      m[r * 3 + c] = sep[r * 3] * sat[c] + sep[r * 3 + 1] * sat[3 + c] + sep[r * 3 + 2] * sat[6 + c];
    }
  }
  return [
    m[0], m[1], m[2], 0, 0,
    m[3], m[4], m[5], 0, 0,
    m[6], m[7], m[8], 0, 0,
    0, 0, 0, 1, 0,
  ];
}
