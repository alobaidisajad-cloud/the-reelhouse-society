/**
 * Every picture of Buster the app ships, and what was measured on each.
 * Written by the renderer beside the drawing (brand/buster); not by hand.
 *
 * A picture with brass points comes in two: `picture` is what lies under the
 * points, `over` what the drawing paints over them (the lids, the lines, the
 * hat). The app lays picture, points, over, in that order.
 *
 * Fractions of the picture: `eyes` where each brass point sits and how big it
 * is, `glance` how far (and, by its sign, which way) the points may slide and
 * stay inside their holes, `hem` how far down the sheet ends, `pivot` where
 * his sway turns him.
 */
export const BUSTER_ART = {
  'unimpressed-48': {
    picture: require('../../assets/buster/unimpressed-48.png'),
    over: require('../../assets/buster/unimpressed-48-over.png'),
    width: 48, height: 66,
    eyes: [{ x: 0.359, y: 0.3648, r: 0.0107 }, { x: 0.5788, y: 0.3629, r: 0.0107 }],
    glance: 0.0237,
    hem: 0.8598,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'unimpressed-80': {
    picture: require('../../assets/buster/unimpressed-80.png'),
    over: require('../../assets/buster/unimpressed-80-over.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.359, y: 0.3648, r: 0.0082 }, { x: 0.5788, y: 0.3629, r: 0.0082 }],
    glance: 0.0237,
    hem: 0.8602,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-48': {
    picture: require('../../assets/buster/suspicious-48.png'),
    over: require('../../assets/buster/suspicious-48-over.png'),
    width: 48, height: 66,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0107 }, { x: 0.5104, y: 0.3574, r: 0.0107 }],
    glance: -0.0237,
    hem: 0.8674,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-56': {
    picture: require('../../assets/buster/suspicious-56.png'),
    over: require('../../assets/buster/suspicious-56-over.png'),
    width: 56, height: 77,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0099 }, { x: 0.5104, y: 0.3574, r: 0.0099 }],
    glance: -0.0237,
    hem: 0.8669,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-80': {
    picture: require('../../assets/buster/suspicious-80.png'),
    over: require('../../assets/buster/suspicious-80-over.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0082 }, { x: 0.5104, y: 0.3574, r: 0.0082 }],
    glance: -0.0237,
    hem: 0.867,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'moved-80': {
    picture: require('../../assets/buster/moved-80.png'),
    over: require('../../assets/buster/moved-80-over.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.3585, y: 0.4182, r: 0.0086 }, { x: 0.5874, y: 0.4156, r: 0.0086 }],
    glance: 0.0237,
    hem: 0.9085,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'dimmed-80': {
    picture: require('../../assets/buster/dimmed-80.png'),
    over: null,
    width: 80, height: 110,
    eyes: [],
    glance: 0,
    hem: 0.892,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'seated-48': {
    picture: require('../../assets/buster/seated-48.png'),
    over: require('../../assets/buster/seated-48-over.png'),
    width: 48, height: 54,
    eyes: [{ x: 0.359, y: 0.4458, r: 0.0107 }, { x: 0.5788, y: 0.4435, r: 0.0107 }],
    glance: 0.0237,
    hem: 1,
    pivot: { x: 0.4688, y: 0.5497 },
  },
} as const;

export type BusterArtKey = keyof typeof BUSTER_ART;
