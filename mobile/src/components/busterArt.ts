/**
 * Every picture of Buster the app ships, and what was measured on each.
 * Written by the renderer beside the drawing (brand/buster); not by hand.
 *
 * Fractions of the picture: `eyes` where each brass point sits and how big it
 * is, `hem` how far down the sheet ends, `pivot` where his sway turns him.
 */
export const BUSTER_ART = {
  'unimpressed-48': {
    picture: require('../../assets/buster/unimpressed-48.png'),
    width: 48, height: 66,
    eyes: [{ x: 0.359, y: 0.3648, r: 0.0107 }, { x: 0.5788, y: 0.3629, r: 0.0107 }],
    hem: 0.8598,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'unimpressed-80': {
    picture: require('../../assets/buster/unimpressed-80.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.359, y: 0.3648, r: 0.0082 }, { x: 0.5788, y: 0.3629, r: 0.0082 }],
    hem: 0.8602,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-48': {
    picture: require('../../assets/buster/suspicious-48.png'),
    width: 48, height: 66,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0107 }, { x: 0.5104, y: 0.3574, r: 0.0107 }],
    hem: 0.8674,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-56': {
    picture: require('../../assets/buster/suspicious-56.png'),
    width: 56, height: 77,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0099 }, { x: 0.5104, y: 0.3574, r: 0.0099 }],
    hem: 0.8669,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'suspicious-80': {
    picture: require('../../assets/buster/suspicious-80.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.2911, y: 0.3696, r: 0.0082 }, { x: 0.5104, y: 0.3574, r: 0.0082 }],
    hem: 0.867,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'moved-80': {
    picture: require('../../assets/buster/moved-80.png'),
    width: 80, height: 110,
    eyes: [{ x: 0.3585, y: 0.4182, r: 0.0086 }, { x: 0.5874, y: 0.4156, r: 0.0086 }],
    hem: 0.9085,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'dimmed-80': {
    picture: require('../../assets/buster/dimmed-80.png'),
    width: 80, height: 110,
    eyes: [],
    hem: 0.892,
    pivot: { x: 0.4688, y: 0.4498 },
  },
  'seated-48': {
    picture: require('../../assets/buster/seated-48.png'),
    width: 48, height: 54,
    eyes: [{ x: 0.359, y: 0.4458, r: 0.0107 }, { x: 0.5788, y: 0.4435, r: 0.0107 }],
    hem: 1,
    pivot: { x: 0.4688, y: 0.5497 },
  },
} as const;

export type BusterArtKey = keyof typeof BUSTER_ART;
