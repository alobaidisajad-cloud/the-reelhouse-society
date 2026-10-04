/**
 * Buster, the drawing — the master every picture of him is made from.
 *
 * This is the approved final design (mobile/design/buster-final.html), as code
 * that writes SVG. `render.mjs` turns it into the app's pictures and the
 * marketing set; nothing here runs on a phone.
 *
 * Three changes from the design page, each so the app's pictures can be exact:
 *   • the pen's wobble is moved into the points (`bake`), not a displacement
 *     filter, so the app can place the brass points where the holes really are;
 *   • `OPT.inkW` thickens the ink at small sizes, as a printer's smaller type is
 *     cut heavier, and `OPT.pointW` does the same for the brass points;
 *   • `OPT.points` leaves the brass points out, for the app to draw live.
 */
export const OPT = { inkW: 1, pointW: 1, points: true };

export const P = { ink: '#0D0B09', sheet: '#E0D4BA', lit: '#F2EBD9', wash: '#4E3D2B', stain: '#9C7A45', hole: '#050403', brass: '#C4961A', bulb: '#F6E3A0', rim: '#D9A93E', moon: '#A9BCCF',
  patch: '#D8CAAC', thread: '#7D6A50', darn: '#8C7757', hat: '#221B15', hatWorn: '#3F3428', band: '#2F251D', bandWorn: '#4A3C2F', dust: '#B9AA90',
  seat: '#2A2018', seatGap: '#0B0907', velvet: '#5A4632' };
let uid = 0;
const id = (p) => p + (++uid);
const f = (n) => n.toFixed(2);
export const svg = (inner, vb = '0 0 200 240', w) => `<svg viewBox="${vb}" ${w ? `width="${w}"` : ''} xmlns="http://www.w3.org/2000/svg" role="img">${inner}</svg>`;

function bez(p, t) {
  const m = 1 - t;
  return [0, 1].map((k) => m * m * m * p[0][k] + 3 * m * m * t * p[1][k] + 3 * m * t * t * p[2][k] + t * t * t * p[3][k]);
}
function brush(p, w, o = {}) {
  const n = o.n ?? 26, min = o.min ?? .35, pow = o.pow ?? .75, L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = bez(p, Math.max(0, t - .01)), b = bez(p, Math.min(1, t + .01)), c = bez(p, t);
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const len = Math.hypot(nx, ny) || 1; nx /= len; ny /= len;
    const s = o.tail ? Math.pow(1 - t, .7) * (1 - min) + min : min + (1 - min) * Math.pow(Math.sin(Math.PI * t), pow);
    const ww = s * w * ((o.fill ?? P.ink) === P.ink ? OPT.inkW : 1) / 2;
    L.push([c[0] + nx * ww, c[1] + ny * ww]); R.push([c[0] - nx * ww, c[1] - ny * ww]);
  }
  const pts = L.concat(R.reverse());
  return `<path d="M ${pts.map((q) => f(q[0]) + ' ' + f(q[1])).join(' L ')} Z" fill="${o.fill ?? P.ink}" opacity="${o.op ?? 1}"/>`;
}
function shape(start, segs) {
  let d = `M ${start[0]} ${start[1]}`, at = start;
  const strokes = [];
  for (const s of segs) {
    const c1 = s.c1 ?? [at[0] + (s.p[0] - at[0]) / 3, at[1] + (s.p[1] - at[1]) / 3];
    const c2 = s.c2 ?? [at[0] + (s.p[0] - at[0]) * 2 / 3, at[1] + (s.p[1] - at[1]) * 2 / 3];
    d += ` C ${c1[0]} ${c1[1]}, ${c2[0]} ${c2[1]}, ${s.p[0]} ${s.p[1]}`;
    strokes.push({ p: [at, c1, c2, s.p], w: s.w ?? 1.8 });
    at = s.p;
  }
  return { d: d + ' Z', strokes };
}

// ── The sheet ───────────────────────────────────────────────────────────────
function rays(flare = 1, L = [11, 17, 23, 28, 21, 15, 10], x0 = 161, x1 = 41, len = 1, phase = null) {
  const segs = [], tips = [], n = L.length, slot = (x0 - x1) / n;
  for (let i = 0; i < n; i++) {
    const xr = x0 - slot * i - (i ? 1.4 : 0), xl = x0 - slot * (i + 1) + 1.4, xm = (xr + xl) / 2;
    const base = 170 + Math.sin(i * 1.3) * 1.8 + i * .5;
    const draught = phase === null ? 0 : Math.sin(phase + i * .9) * 2;
    const tx = xm + (xm - 100) * .22 * flare + draught, ty = base + L[i] * flare * len + (phase === null ? 0 : Math.cos(phase + i * .9) * .8);
    segs.push({ c1: [xr, base + L[i] * .4], c2: [tx + 4, ty - 6], p: [tx + 2.6, ty], w: 1.9 });
    segs.push({ p: [tx + .2, ty - 3.4], w: 1.2 });
    segs.push({ p: [tx - 2.6, ty + 1.2], w: 1.2 });
    segs.push({ c1: [tx - 4, ty - 6], c2: [xl, base + L[i] * .4], p: [xl, base], w: 1.9 });
    tips.push([tx, ty]);
    if (i < n - 1) {
      segs.push({ p: [xl - 1.4, base - 5.5], w: 1.2 });
      segs.push({ p: [xl - 2.8, 170 + Math.sin((i + 1) * 1.3) * 1.8 + (i + 1) * .5], w: 1.2 });
    }
  }
  return { segs, tips };
}
function body(flare = 1, len = 1, phase = null) {
  const R = rays(flare, undefined, undefined, undefined, len, phase);
  const S = shape([57, 127], [
    { c1: [53, 86], c2: [73, 52], p: [99, 51], w: 2.4 },
    { c1: [125, 50], c2: [146, 82], p: [143, 123], w: 3.4 },
    { c1: [142, 143], c2: [154, 158], p: [161, 170], w: 3.6 },
    ...R.segs,
    { c1: [45, 160], c2: [57, 146], p: [57, 127], w: 2.6 },
  ]);
  return { S, tips: R.tips };
}
const FOLDS = [
  [[65, 117], [60, 135], [55, 151], [52, 169]],
  [[137, 116], [142, 134], [149, 150], [153, 169]],
  [[84, 137], [81, 150], [77, 162], [74, 176]],
  [[119, 139], [122, 152], [126, 162], [129, 176]],
];

// ── The mending ─────────────────────────────────────────────────────────────
// Low on his right, where the sheet brushes the same armrest every night: old
// linen of another weave, edge turned under, small running stitches, a pucker
// where the thread was pulled tight. The sheet's fold runs on across it.
// Sewn into the sheet, not laid on it: the cloth goes down BEFORE the sheet's
// light and shadow, so the same light falls across both, and the fold that runs
// down his right side runs straight through it. Its sides lie along the drape;
// its top and bottom give a little where the fold crosses them.
const PATCH = 'M 113.6 148.8 C 116.6 148.2, 119.2 148.4, 121 149.3 C 123.4 148.4, 126.4 147.9, 128.8 147.8 C 130.2 152.8, 131.4 158, 132.4 163.2 C 130.2 163.6, 128.2 163.9, 126.4 164.6 C 123.4 164, 120.2 164.1, 117.2 164.4 C 115.6 159.2, 114.4 154, 113.6 148.8 Z';
const INSET = 'translate(123 156.3) scale(.84) translate(-123 -156.3)';

function patchCloth() {
  const cl = id('p');
  return `<clipPath id="${cl}"><path d="${PATCH}"/></clipPath>
    <path d="${PATCH}" fill="${P.patch}"/>
    <rect x="110" y="144" width="26" height="24" filter="url(#weave2)" opacity=".32" clip-path="url(#${cl})"/>`;
}

// The seam: a hairline where the cloths meet, the turned edge catching light,
// and small even stitches in a thread a shade darker than the linen.
function patchSeam() {
  return `<path d="${PATCH}" fill="none" stroke="#7A6850" stroke-width=".4" opacity=".32"/>
    <path d="${PATCH}" fill="none" stroke="#F3EBD8" stroke-width=".4" opacity=".18" transform="${INSET} translate(0 -.3)"/>
    <path d="${PATCH}" fill="none" stroke="${P.thread}" stroke-width=".45" stroke-dasharray=".8 1.6" stroke-linecap="round" opacity=".45" transform="${INSET}"/>`;
}

// ── A hat worn every night since 1924 ───────────────────────────────────────
// It sits ON him: a tight shadow right under the brim, a shade where the brim
// overhangs each side of his head, and the sheet drawn into small creases by
// the hat's weight. Lifted off (proud, startled), the sheet lets go.
const SEAT = 3;
function seat(o = {}) {
  const tilt = o.tilt ?? -7, lift = o.lift ?? 0;
  if (lift < -4) return '';
  return `<g transform="translate(0 ${lift + SEAT}) rotate(${tilt} 100 54)">
    <g filter="url(#blur1)">${brush([[57, 58.6], [70, 64.4], [120, 66], [143, 58.8]], 6.4, { min: .5, fill: P.wash, op: .42 })}</g>
    <ellipse cx="65" cy="67" rx="9" ry="4.4" fill="${P.wash}" opacity=".24" filter="url(#blur3)"/>
    <ellipse cx="135" cy="66" rx="9" ry="4.4" fill="${P.wash}" opacity=".3" filter="url(#blur3)"/>
    ${brush([[71, 63.4], [68, 69.6], [65, 75.6], [62.6, 82.4]], 6, { fill: P.wash, op: .1 })}
    ${brush([[129, 63.4], [132, 69.4], [135, 74.6], [137.4, 80.6]], 6, { fill: P.wash, op: .12 })}
    ${brush([[71, 63.4], [68, 69.6], [65, 75.6], [62.6, 82.4]], 1.3, { tail: true, min: .15, op: .42 })}
    ${brush([[129, 63.4], [132, 69.4], [135, 74.6], [137.4, 80.6]], 1.2, { tail: true, min: .15, op: .38 })}
    ${brush([[86, 64.6], [85.4, 67.6], [84.6, 70], [84, 72.6]], .9, { tail: true, min: .15, op: .26 })}
  </g>`;
}

function hat(o = {}) {
  const tilt = o.tilt ?? -7, lift = (o.lift ?? 0) + SEAT;
  const brim = 'M 57 56.4 C 63 50.4, 80 48.4, 100 48.6 C 121 48.8, 137 50.6, 143 54.8 C 141.4 58, 136.6 60.2, 129.4 61.2 L 126.6 60.2 L 124.6 61.8 C 110 63, 88 63.2, 74 61.8 C 66 61, 60.4 59.4, 57 56.4 Z';
  const crown = 'M 75.4 53 C 75.6 46, 76.2 39.2, 77.8 33 C 84 30.6, 92 29.7, 100.4 29.9 C 109 30.1, 116.8 31, 122.2 33.2 C 123.8 39.4, 124.6 46, 124.8 53 Z';
  const cb = id('hb'), cc = id('hc');
  const dust = [[66, 55.6], [71, 54], [88, 51.8], [109, 51.6], [118, 52.4], [90, 33.4], [104, 32.8], [113, 34.4], [133, 55.2]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i % 3 ? .45 : .7}" fill="${P.dust}" opacity="${i % 2 ? .45 : .3}"/>`).join('');
  return `<g transform="translate(0 ${lift}) rotate(${tilt} 100 54)">
    <clipPath id="${cb}"><path d="${brim}"/></clipPath>
    <clipPath id="${cc}"><path d="${crown}"/></clipPath>
    <path d="${brim}" fill="${P.hat}"/>
    <g clip-path="url(#${cb})">
      <rect x="50" y="44" width="100" height="22" filter="url(#felt)" opacity=".35"/>
      <ellipse cx="100" cy="58.6" rx="16" ry="2.6" fill="${P.hatWorn}" opacity=".7" filter="url(#blur1)"/>
      <path d="M 58 56 C 64 51.4, 76 50, 90 49.6" stroke="${P.hatWorn}" stroke-width="2" fill="none" opacity=".6" filter="url(#blur1)"/>
    </g>
    <path d="${crown}" fill="${P.hat}"/>
    <g clip-path="url(#${cc})">
      <rect x="70" y="26" width="60" height="30" fill="url(#sunfade)"/>
      <rect x="70" y="26" width="60" height="30" filter="url(#felt)" opacity=".32"/>
      <path d="M 114.6 34.6 C 116.8 38.6, 117.4 43.4, 116.4 47.6" stroke="#0E0B08" stroke-width="2.4" fill="none" opacity=".6" filter="url(#blur1)"/>
      <path d="M 117.6 34.4 C 119.6 38.6, 120 43, 119.2 47.4" stroke="${P.hatWorn}" stroke-width="1.4" fill="none" opacity=".7" filter="url(#blur1)"/>
    </g>
    <path d="M 75.8 47 L 124.4 47.2 L 124.8 53 L 75.4 53 Z" fill="${P.band}"/>
    <path d="M 76 52.6 L 124.6 52.6" stroke="${P.bandWorn}" stroke-width=".9" stroke-dasharray="2.4 .8 1.2 1.4" opacity=".9"/>
    <path d="M 75.8 47 L 124.4 47.2" stroke="${P.bandWorn}" stroke-width=".7" opacity=".7"/>
    <path d="M 78.6 47.4 C 80.6 46.2, 83 46.4, 84 48 C 83 50, 80.6 51.4, 78.6 50.6 Z" fill="${P.bandWorn}"/>
    ${brush([[80.6, 50.6], [80.2, 53.4], [79.2, 55.8], [78.4, 58]], .7, { tail: true, min: .2, fill: P.bandWorn, op: .9 })}
    ${brush([[80, 36.2], [92, 39.6], [108, 39.8], [120.4, 36.4]], 1.6, { min: .5, fill: '#0E0B08', op: .9 })}
    ${brush([[80.4, 34.6], [92, 37.6], [108, 37.8], [120, 34.8]], 1, { min: .4, fill: P.hatWorn, op: .8 })}
    <path d="M 76 46.3 L 124.4 46.5" stroke="#120E0B" stroke-width=".8" opacity=".6"/>
    <ellipse cx="114" cy="44.4" rx="7" ry="2" fill="#4A3C2E" opacity=".35" filter="url(#blur1)"/>
    ${dust}
    ${brush([[57, 56.4], [70, 49.6], [130, 49.6], [143, 54.8]], 1.4, { min: .55, fill: P.hatWorn })}
    ${brush([[58.8, 56.4], [66.6, 60.6], [112, 62.4], [123.8, 61]], 1, { min: .5, fill: '#4F4234', op: .85 })}
    <path d="M 60 56.6 C 67 60.4, 90 62, 123 60.6" stroke="#6B5A47" stroke-width=".45" fill="none" stroke-dasharray=".8 1.3" opacity=".7"/>
    ${brush([[57, 56.4], [66, 61.6], [112, 63.4], [124.6, 61.8]], 2.6, { min: .55 })}
    ${brush([[129.4, 61.2], [135, 60.4], [140, 58.2], [143, 54.8]], 2.2, { min: .55 })}
    <path d="M 124.6 61.8 L 126.6 60.2 L 129.4 61.2" stroke="${P.ink}" stroke-width="1.1" fill="none"/>
    ${brush([[125.4, 61.4], [125, 63.2], [124.4, 64.6], [124.8, 66]], .5, { tail: true, min: .15, fill: P.hatWorn })}
    ${brush([[127.6, 60.8], [128.2, 62.6], [128, 64.2], [128.8, 65.4]], .45, { tail: true, min: .15, fill: P.hatWorn })}
    ${brush([[77.8, 33], [84, 30.6], [116, 30.6], [122.2, 33.2]], 1.5, { min: .55, fill: P.hatWorn })}
    ${brush([[77.8, 33], [76.2, 39], [75.6, 46], [75.4, 53]], 1.6, { min: .55 })}
    ${brush([[122.2, 33.2], [123.8, 39.4], [124.6, 46], [124.8, 53]], 2.2, { min: .55 })}
    <path d="M 59 55.8 C 63 52.4, 70 50.8, 78 50.2" stroke="${P.moon}" stroke-width=".8" fill="none" opacity=".3"/>
  </g>`;
}

// ── The eyes ────────────────────────────────────────────────────────────────
/**
 * What the drawing paints over the brass points: the lid and the lines under
 * each hole, and everything after the eyes. The app draws the points live, so
 * the renderer gives these a picture of their own, laid over the points: a low
 * lid still cuts a point to a half-moon.
 */
export const over = (s) => (OPT.points || !s ? s : `<g data-over="">${s}</g>`);

// A glance goes the way the point has room: a point already looking right glances left.
const DRIFT = (look) => `<animateTransform attributeName="transform" type="translate" values="0 0;0 0;${look > 0 ? -3.6 : 3.6} -.3;${look > 0 ? -3.6 : 3.6} -.3;0 0;0 0" keyTimes="0;.6;.66;.84;.9;1" dur="13s" repeatCount="indefinite"/>`;
function hole(cx, cy, w, o = {}) {
  const open = o.open ?? 1, tilt = o.tilt ?? 0, look = o.look ?? 0, glow = o.glow ?? 1;
  const h = 10 * open;
  const tl = [cx - w / 2, cy - 3.8 + tilt], tr = [cx + w / 2, cy - 3.8 - tilt];
  const bottom = cy - 3.8 + h;
  const arch = o.arch ? `Q ${cx} ${cy - 10} ` : 'L ';
  const d = `M ${tl[0]} ${tl[1]} ${arch}${tr[0]} ${tr[1]} C ${tr[0] - .4} ${bottom - h * .2}, ${cx + w * .18} ${bottom}, ${cx} ${bottom} C ${cx - w * .2} ${bottom}, ${tl[0] + .4} ${bottom - h * .2}, ${tl[0]} ${tl[1]} Z`;
  const gx = cx + look, gy = cy - 3.8 + h * .6, gr = (o.pin ? .6 : 1.25) * OPT.pointW;
  const clip = id('h');
  const inside = o.dark ? '' : `
    <clipPath id="${clip}"><path d="${d}"/></clipPath>
    <g clip-path="url(#${clip})">
      <path d="M ${tl[0]} ${bottom - 2.6} C ${cx - w * .2} ${bottom + .2}, ${cx + w * .2} ${bottom + .2}, ${tr[0]} ${bottom - 2.6}" fill="none" stroke="${P.rim}" stroke-width="${1.3 * Math.min(glow, 1.6)}" opacity="${.35 * glow}"/>
      <g><circle cx="${gx}" cy="${gy}" r="${4.4 * glow}" fill="url(#glint)" opacity="${.85 * Math.min(glow, 1.3)}"/>${o.drift ? DRIFT(look) : ''}</g>
    </g>`;
  // Left out, the point leaves a mark the renderer measures: where the app draws it.
  const points = o.dark ? '' : !OPT.points ? `<circle data-eye="${gr}" cx="${gx}" cy="${gy}" r="${gr}" fill="none"/>` : `<g>
    <circle cx="${gx}" cy="${gy}" r="${gr}" fill="${P.brass}"/>
    <circle cx="${gx + .3}" cy="${gy - .3}" r="${gr * .5}" fill="${P.bulb}"/>
    ${o.blink ? `<animate attributeName="opacity" values="1;1;0;0;1;1" keyTimes="0;.9;.92;.95;.97;1" dur="6.5s" repeatCount="indefinite"/>` : ''}
    ${o.drift ? DRIFT(look) : ''}
  </g>`;
  const top = o.arch
    ? brush([tl, [cx - w * .2, cy - 10.6], [cx + w * .2, cy - 10.6], tr], 3, { min: .5 })
    : brush([[tl[0] - 1.8, tl[1] + .3], [cx - w * .2, tl[1] - .7], [cx + w * .2, tr[1] - .7], [tr[0] + 1.8, tr[1] + .3]], 3.4, { min: .4 });
  const under = brush([[tl[0] + 1, tl[1] + 1.2], [cx - w * .26, bottom + .4], [cx + w * .26, bottom + .4], [tr[0] - 1, tr[1] + 1.2]], 1.3, { min: .3, op: .9 });
  const lines = o.lines === false ? '' : [[-4.6, 6.2], [0, 8.2], [4.6, 6.2]].map(([dx, len]) =>
    brush([[cx + dx, bottom + 3.2], [cx + dx * 1.04, bottom + 3.2 + len * .33], [cx + dx * 1.12, bottom + 3.2 + len * .66], [cx + dx * 1.26, bottom + 3.2 + len]], 1.75, { tail: true, min: .15 })).join('');
  // The hole is marked where the point's mark is: the renderer measures how far the point may glance inside it.
  return `<path${OPT.points ? '' : ' data-hole=""'} d="${d}" fill="${P.hole}"/>${inside}${points}${over(`${top}${under}${lines}`)}`;
}

function drip(x, y) {
  const t = y + 16.4, r = 2.6, X = x + 1.3, tear = (s) => {
    const cx = X, cy = t + 5.2, k = (px, py) => `${f(cx + (px - cx) * s)} ${f(cy + (py - cy) * s)}`;
    return `M ${k(X, t)} C ${k(X + .8, t + 1.9)}, ${k(X + r, t + 3)}, ${k(X + r, t + 5.2)} A ${f(r * s)} ${f(r * s)} 0 0 1 ${k(X - r, t + 5.2)} C ${k(X - r, t + 3)}, ${k(X - .8, t + 1.9)}, ${k(X, t)} Z`;
  };
  return brush([[x, y + 9.4], [x + .1, y + 12], [X - .3, y + 14.2], [X, t + .8]], 1.3, { min: .5, op: .5, fill: P.wash })
    + `<path d="${tear(1.5)}" fill="${P.wash}" opacity=".2"/>`
    + `<path d="${tear(1)}" fill="${P.ink}" opacity=".9"/>`
    + brush([[X - 1.5, t + 3.1], [X - 1.9, t + 4.1], [X - 1.8, t + 5.3], [X - 1.3, t + 6.2]], .62, { min: .2, op: .8, fill: P.lit });
}

// posture: the sheet's own acting. len: how heavily the hem hangs.
export const MOODS = {
  unimpressed: { eye: {}, hat: {} },
  suspicious:  { l: { open: .58, look: 3 }, r: { open: .78, look: 3 }, hat: { tilt: -14, lift: 2 },
                 posture: 'rotate(-6 100 200) translate(-3 1)' },
  moved:       { eye: { open: 1.04 }, drip: true, hat: { lift: 3, tilt: -4 }, len: 1.22,
                 posture: 'translate(0 5) translate(100 200) scale(1.04 .94) translate(-100 -200)' },
  proud:       { eye: { glow: 2.4 }, hat: { lift: -11, tilt: -2 }, len: .92,
                 posture: 'translate(100 200) scale(.97 1.05) translate(-100 -200)' },
  dimmed:      { eye: { open: .18, dark: true }, hat: { lift: 7, tilt: -10 }, len: .8,
                 posture: 'translate(0 12) translate(100 200) scale(.96 .9) translate(-100 -200)' },
  startled:    { eye: { open: 1.32, arch: true, pin: true, tilt: 0, lines: false }, hat: { lift: -24, tilt: 11 }, flare: 1.32,
                 posture: 'translate(100 140) scale(1.06 1.04) translate(-100 -140)' },
};

// ── Buster ──────────────────────────────────────────────────────────────────
// The pen's wobble, in the points: a slow waver of about a unit, the same field
// everywhere, so a hole and the point drawn in it move together. Arcs are left
// as drawn (their flags are not coordinates).
function wob(x, y) {
  return [
    x + .7 * Math.sin(x * .11 + y * .05 + 1.3) + .4 * Math.sin(y * .23 - x * .07 + 4.1),
    y + .7 * Math.sin(y * .1 - x * .06 + 2.2) + .4 * Math.sin(x * .19 + y * .13 + .7),
  ];
}
function bakeD(d) {
  if (/[AaHhVv]/.test(d)) return d;
  const tok = d.match(/-?(?:\d+\.?\d*|\.\d+)|[^-\d.]+/g) || [];
  const at = [];
  tok.forEach((t, i) => { if (/^-?[\d.]/.test(t)) at.push(i); });
  if (at.length % 2) return d;
  for (let k = 0; k < at.length; k += 2) {
    const [x, y] = wob(+tok[at[k]], +tok[at[k + 1]]);
    tok[at[k]] = f(x); tok[at[k + 1]] = f(y);
  }
  return tok.join('');
}
function bake(str) {
  return str
    .replace(/ d="([^"]*)"/g, (m, d) => ` d="${bakeD(d)}"`)
    .replace(/<(circle|ellipse)([^>]*?) cx="([-\d.]+)" cy="([-\d.]+)"/g, (m, tag, rest, x, y) => {
      const [X, Y] = wob(+x, +y);
      return `<${tag}${rest} cx="${f(X)}" cy="${f(Y)}"`;
    });
}

export function buster(o = {}) {
  return bake(drawBuster(o));
}

function drawBuster(o = {}) {
  const m = o.mood ?? 'unimpressed', E = MOODS[m];
  const B = body(E.flare ?? 1, E.len ?? 1), S = B.S, cl = id('s');
  // Alive: the hem moves in a draught, one shape to the next and back.
  const draught = o.alive ? `<animate attributeName="d" values="${[0, 2.1, 4.2, 0].map((ph) => body(E.flare ?? 1, E.len ?? 1, ph).S.d).join(';')}" dur="5.4s" repeatCount="indefinite"/>` : '';
  const threads = B.tips.filter((_, i) => i % 2 === 1).map(([x, y], i) =>
    brush([[x - 1, y], [x - 2, y + 3], [x - 1, y + 5], [x - 2.5 + i, y + 8]], .9, { tail: true, min: .15, op: .7 })).join('');
  const lt = { ...E.eye, ...E.l }, rt = { ...E.eye, ...E.r };
  return `<g transform="rotate(-3 100 120) ${E.posture ?? ''}" opacity="${m === 'dimmed' ? .62 : 1}">${o.sway ? `<animateTransform attributeName="transform" type="rotate" values="0 100 120; 1.8 100 120; 0 100 120" additive="sum" dur="7s" repeatCount="indefinite"/>` : ''}
    <g>
      <clipPath id="${cl}"><path d="${S.d}">${draught}</path></clipPath>
      <path d="${S.d}" fill="${P.sheet}">${draught}</path>
      <g clip-path="url(#${cl})">
        ${o.mend === false ? '' : patchCloth()}
        <ellipse cx="76" cy="74" rx="38" ry="30" fill="${P.lit}" opacity=".8" filter="url(#blur6)"/>
        <ellipse cx="100" cy="85" rx="36" ry="10" fill="${P.lit}" opacity=".4" filter="url(#blur6)"/>
        <ellipse cx="100" cy="100" rx="40" ry="13" fill="${P.wash}" opacity=".11" filter="url(#blur6)"/>
        <path d="M 112 40 C 152 60, 166 120, 162 232 L 200 232 L 200 40 Z" fill="${P.wash}" opacity=".3" filter="url(#blur6)"/>
        ${FOLDS.map((p) => brush(p, 10, { fill: P.wash, op: .13 })).join('')}
        <circle cx="70" cy="174" r="8" fill="${P.stain}" opacity=".12" filter="url(#stain)"/>
        <rect x="20" y="30" width="170" height="210" filter="url(#weave)" opacity=".6"/>
        <rect x="20" y="30" width="170" height="210" filter="url(#fiber)" opacity=".5"/>
        ${o.moon === false ? '' : `<path d="${S.d}" fill="none" stroke="${P.moon}" stroke-width="7" opacity=".38" filter="url(#blur3)" mask="url(#moonMask)"/>`}
        ${o.hat === false ? '' : seat(E.hat)}
      </g>
      ${o.mend === false ? '' : patchSeam()}
      ${FOLDS.map((p, i) => brush(p, i < 2 ? 2 : 1.5, { op: i < 2 ? .8 : .6 })).join('')}
      ${o.alive ? `<path d="${S.d}" fill="none" stroke="${P.ink}" stroke-width="2.6" stroke-linejoin="round">${draught}</path>` : S.strokes.map((s) => brush(s.p, s.w, { min: .55, pow: .6 })).join('') + threads}
      ${hole(84, 99, 18, { ...lt, ...o.eyes, tilt: lt.tilt ?? .9, blink: o.blink, drift: o.alive })}
      ${hole(117, 101.4, 17, { ...rt, ...o.eyes, tilt: rt.tilt ?? -.4, blink: o.blink, drift: o.alive })}
      ${over(`${E.drip ? drip(84, 105.4) : ''}
      ${m === 'startled' ? `${brush([[54, 40], [51, 37], [48, 34], [45, 30]], 2.4)}${brush([[100, 2], [100, -2], [100, -6], [100, -10]], 2.4)}${brush([[146, 40], [149, 37], [152, 34], [155, 30]], 2.4)}` : ''}
      ${o.hat === false ? '' : hat(E.hat)}`)}
    </g>
  </g>`;
}

export const shadow = (y = 230, alive) => `<ellipse cx="100" cy="${y}" rx="44" ry="6" fill="#000" opacity=".5" filter="url(#blur3)">${alive ? `<animate attributeName="rx" values="44;38;44" dur="5s" repeatCount="indefinite"/><animate attributeName="opacity" values=".5;.32;.5" dur="5s" repeatCount="indefinite"/>` : ''}</ellipse>`;
/**
 * In the back row: the seat backs of the row in front cross him at the waist,
 * velvet worn at the top edge and inked like the rest of him, so only the hat,
 * the eyes and the body of the sheet show. He is not floating; he has a seat.
 */
export function seated(o = {}) {
  const face = id('seat');
  const row = [[-16, 171], [30, 168.5], [78, 166], [126, 168.5], [172, 171]];
  // The row's own dark behind the backs: nothing of him shows between seats.
  const backing = `<path d="M -20 176 L 220 176 L 220 260 L -20 260 Z" fill="${P.seatGap}"/>`;
  const backs = row.map(([x, y]) => {
    const top = `M ${x} ${y + 8} C ${x} ${y + 2}, ${x + 4} ${y}, ${x + 10} ${y} L ${x + 34} ${y} C ${x + 40} ${y}, ${x + 44} ${y + 2}, ${x + 44} ${y + 8}`;
    return `<path d="${top} L ${x + 44} 260 L ${x} 260 Z" fill="url(#${face})"/>`
      // velvet worn pale along the top, where hands and heads rest
      + `<path d="M ${x + 3} ${y + 5} C ${x + 4} ${y + 2.2}, ${x + 7} ${y + 1.4}, ${x + 11} ${y + 1.4} L ${x + 33} ${y + 1.4} C ${x + 37} ${y + 1.4}, ${x + 40} ${y + 2.2}, ${x + 41} ${y + 5}" fill="none" stroke="${P.velvet}" stroke-width="1.5" stroke-linecap="round" opacity=".55"/>`
      + `<path d="M ${x + 22} ${y + 4} L ${x + 22} 260" stroke="${P.seatGap}" stroke-width=".9" opacity=".6"/>`
      + brush([[x, y + 8], [x + 1, y + 1], [x + 43, y + 1], [x + 44, y + 8]], 1.6, { min: .5 });
  }).join('');
  return buster({ mood: o.mood ?? 'unimpressed' })
    + `<linearGradient id="${face}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${P.seat}"/><stop offset="1" stop-color="${P.seatGap}"/></linearGradient>`
    + over(bake(backing + backs));
}

/**
 * The small mark: the same character in fewer, bolder lines, for sizes where
 * the full drawing would turn to mud. The logo's seven hem strips and the three
 * lines under each hole are kept; they are who he is.
 */
export function smallBuster() {
  const R = rays(1, [12, 18, 23, 27, 22, 16, 11], 158, 44);
  const lines = (cx, cy) => [-6, 0, 6].map((dx) => brush([[cx + dx, cy + 10], [cx + dx * 1.05, cy + 13], [cx + dx * 1.12, cy + 16], [cx + dx * 1.25, cy + (dx ? 18.5 : 20.5)]], 3.4, { tail: true, min: .25 })).join('');
  const S = shape([58, 127], [
    { c1: [54, 86], c2: [74, 54], p: [100, 54] }, { c1: [126, 54], c2: [146, 86], p: [142, 127] },
    { c1: [143, 146], c2: [151, 160], p: [156, 170] }, ...R.segs, { c1: [49, 160], c2: [58, 146], p: [58, 127] },
  ]);
  const holeS = (cx, cy, w) => `<path d="M ${cx - w / 2} ${cy - 5} L ${cx + w / 2} ${cy - 5.6} C ${cx + w / 2} ${cy + 4}, ${cx + w * .2} ${cy + 7}, ${cx} ${cy + 7} C ${cx - w * .2} ${cy + 7}, ${cx - w / 2} ${cy + 4}, ${cx - w / 2} ${cy - 5} Z" fill="${P.hole}"/>
    <circle cx="${cx}" cy="${cy + 2.4}" r="2.6" fill="${P.brass}"/>${lines(cx, cy)}`;
  return `<g transform="rotate(-3 100 120)">
    <path d="${S.d}" fill="${P.sheet}" stroke="${P.ink}" stroke-width="5" stroke-linejoin="round"/>
    <path d="M 118 150 L 136 148 L 137.4 164 L 119.4 165.4 Z" fill="${P.patch}" stroke="${P.thread}" stroke-width="2" stroke-dasharray="3 2.4"/>
    ${holeS(83, 101, 24)}${holeS(118, 103, 22)}
    <g transform="rotate(-7 100 56)">
      <path d="M 54 58.6 C 68 50, 132 50, 146 57 C 139 64.6, 61 65.6, 54 58.6 Z" fill="${P.hat}" stroke="${P.ink}" stroke-width="3"/>
      <path d="M 73 56 L 76 30 C 91 26, 109 26, 124 30 L 127 56 Z" fill="${P.hat}" stroke="${P.ink}" stroke-width="3"/>
      <path d="M 78 32 C 92 29.4, 108 29.4, 122 32 L 122.6 38 C 108 35.6, 92 35.6, 77.4 38 Z" fill="${P.hatWorn}" opacity=".8"/>
      <rect x="74" y="48" width="52" height="7" fill="${P.band}"/>
    </g>
  </g>`;
}


export function stamp(o = {}) {
  const B = body(1), brass = o.ink ?? '#C4961A', ground = o.ground ?? '#0A0806';
  const holeAt = (cx, cy, w, tilt) => {
    const h = 10, tl = [cx - w / 2, cy - 3.8 + tilt], tr = [cx + w / 2, cy - 3.8 - tilt], b = cy - 3.8 + h;
    const lines = [[-4.6, 6.2], [0, 8.2], [4.6, 6.2]].map(([dx, len]) =>
      brush([[cx + dx, b + 3.2], [cx + dx * 1.04, b + 3.2 + len * .33], [cx + dx * 1.12, b + 3.2 + len * .66], [cx + dx * 1.26, b + 3.2 + len]], 2, { tail: true, min: .2, fill: ground })).join('');
    return `<path d="M ${tl[0] - 1} ${tl[1]} L ${tr[0] + 1} ${tr[1]} C ${tr[0]} ${b - 2}, ${cx + w * .18} ${b + .6}, ${cx} ${b + .6} C ${cx - w * .2} ${b + .6}, ${tl[0]} ${b - 2}, ${tl[0] - 1} ${tl[1]} Z" fill="${ground}"/>
      <circle cx="${cx}" cy="${cy - 3.8 + h * .6}" r="1.7" fill="${brass}"/>${lines}`;
  };
  return `<g filter="url(#press)"><g transform="rotate(-3 100 120)">
    <path d="${B.S.d}" fill="${brass}"/>
    ${FOLDS.map((p, i) => brush(p, i < 2 ? 2.6 : 2, { fill: ground })).join('')}
    <path d="${PATCH}" fill="none" stroke="${ground}" stroke-width="1.2" stroke-dasharray="2 1.6"/>
    ${holeAt(84, 99, 18, .9)}${holeAt(117, 101.4, 17, -.4)}
    <g transform="translate(0 3) rotate(-7 100 54)">
      ${brush([[57, 58.6], [70, 64.4], [120, 66], [143, 58.8]], 4.4, { min: .5, fill: ground })}
      <path d="M 57 56.4 C 63 50.4, 80 48.4, 100 48.6 C 121 48.8, 137 50.6, 143 54.8 C 141.4 58, 136.6 60.2, 129.4 61.2 L 126.6 60.2 L 124.6 61.8 C 110 63, 88 63.2, 74 61.8 C 66 61, 60.4 59.4, 57 56.4 Z" fill="${brass}"/>
      <path d="M 75.4 53 C 75.6 46, 76.2 39.2, 77.8 33 C 84 30.6, 92 29.7, 100.4 29.9 C 109 30.1, 116.8 31, 122.2 33.2 C 123.8 39.4, 124.6 46, 124.8 53 Z" fill="${brass}"/>
      <path d="M 75.6 47.4 L 124.6 47.6 L 124.8 53 L 75.4 53 Z" fill="${ground}"/>
      ${brush([[80, 36.2], [92, 39.6], [108, 39.8], [120.4, 36.4]], 1.8, { min: .5, fill: ground })}
    </g>
  </g></g>`;
}

export const DEFS = `<defs>
    <filter id="pen" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.03" numOctaves="2" seed="5" result="w"/>
      <feDisplacementMap in="SourceGraphic" in2="w" scale="2" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
    <filter id="grain" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="3" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .45  0 0 0 0 .4  0 0 0 0 .33  0 0 0 .6 -.14"/>
    </filter>
    <filter id="fiber" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="2.6" numOctaves="2" seed="31" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .3  0 0 0 0 .24  0 0 0 0 .16  0 0 0 .9 -.32"/>
    </filter>
    <filter id="weave" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="1.6 0.6" numOctaves="1" seed="8" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .35  0 0 0 0 .27  0 0 0 0 .18  0 0 0 .5 -.12"/>
    </filter>
    <filter id="weave2" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.9 2.2" numOctaves="1" seed="14" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .32  0 0 0 0 .26  0 0 0 0 .18  0 0 0 .75 -.2"/>
    </filter>
    <!-- Felt worn smooth and scuffed: the hat's own surface. -->
    <filter id="felt" x="0" y="0" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="3" seed="17" result="n"/>
      <feColorMatrix in="n" type="matrix" values="0 0 0 0 .5  0 0 0 0 .44  0 0 0 0 .36  0 0 0 .9 -.36"/>
    </filter>
    <filter id="stain" x="-20%" y="-20%" width="140%" height="140%">
      <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves="3" seed="21" result="n"/>
      <feDisplacementMap in="SourceGraphic" in2="n" scale="9"/>
      <feGaussianBlur stdDeviation="1.2"/>
    </filter>
    <filter id="blur1"><feGaussianBlur stdDeviation="1"/></filter>
    <filter id="blur3"><feGaussianBlur stdDeviation="3"/></filter>
    <filter id="blur6"><feGaussianBlur stdDeviation="6"/></filter>
    <radialGradient id="glint" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#F0D98A" stop-opacity=".85"/><stop offset=".5" stop-color="#C4961A" stop-opacity=".25"/><stop offset="1" stop-color="#C4961A" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sunfade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#6A5B49" stop-opacity=".75"/><stop offset=".55" stop-color="#4A3E31" stop-opacity=".25"/><stop offset="1" stop-color="#2A221A" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="moonSide" x1="0" y1="0" x2="1" y2="0"><stop offset=".25" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="moonMask" maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="240"><rect width="200" height="240" fill="url(#moonSide)"/></mask>
  </defs>

  <defs>
    <filter id="press" x="-10%" y="-10%" width="120%" height="120%">
      <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="4" result="warp"/>
      <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G" result="rough"/>
      <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="1" seed="9" result="speck"/>
      <feColorMatrix in="speck" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -6 0 0 0 4.8" result="holes"/>
      <feComposite in="rough" in2="holes" operator="in"/>
    </filter>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".35" stop-color="#fff"/><stop offset=".95" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
  </defs>`;
