/**
 * QUOTE INK — the outline of Spectral Italic's “ and ”, read from the app's own
 * font file, as SVG paths in ems (y down, the ink's top-left at 0,0), with the
 * size of the box the ink fills. The Lobby draws its quote mark from these
 * (parts.tsx, QUOTE_MARKS): a drawn mark stands in a box exactly as big as its
 * ink, so it never reaches over the words it opens, and it does not wait on a
 * font being registered with the drawing layer.
 *   node mockups/tools/quote-ink.cjs
 *
 * TrueType read by hand (cmap format 4, loca, glyf — simple and composite
 * glyphs); a quadratic outline maps onto SVG's Q directly.
 */
const fs = require('fs');
const path = require('path');

const TTF = path.join(__dirname, '..', '..', 'node_modules', '@expo-google-fonts', 'spectral',
  '400Regular_Italic', 'Spectral_400Regular_Italic.ttf');
const buf = fs.readFileSync(TTF);
const u16 = (o) => buf.readUInt16BE(o);
const i16 = (o) => buf.readInt16BE(o);
const u32 = (o) => buf.readUInt32BE(o);

const tables = {};
for (let i = 0, n = u16(4); i < n; i++) {
  const r = 12 + i * 16;
  tables[buf.toString('ascii', r, r + 4)] = u32(r + 8);
}
const unitsPerEm = u16(tables.head + 18);
const longLoca = i16(tables.head + 50) === 1;
const loca = (g) => (longLoca ? u32(tables.loca + g * 4) : u16(tables.loca + g * 2) * 2);

function glyphOf(code) {
  const cmap = tables.cmap;
  for (let i = 0, n = u16(cmap + 2); i < n; i++) {
    const sub = cmap + u32(cmap + 4 + i * 8 + 4);
    if (u16(sub) !== 4) continue;
    const segs = u16(sub + 6) / 2;
    const ends = sub + 14, starts = ends + segs * 2 + 2, deltas = starts + segs * 2, offsets = deltas + segs * 2;
    for (let s = 0; s < segs; s++) {
      if (code > u16(ends + s * 2) || code < u16(starts + s * 2)) continue;
      const ro = u16(offsets + s * 2);
      if (ro === 0) return (code + i16(deltas + s * 2)) & 0xffff;
      const g = u16(offsets + s * 2 + ro + (code - u16(starts + s * 2)) * 2);
      return g ? (g + i16(deltas + s * 2)) & 0xffff : 0;
    }
  }
  throw new Error(`no glyph for U+${code.toString(16)}`);
}

/** A glyph's contours, each a list of { x, y, on }, in font units (y up). */
function contoursOf(g, dx = 0, dy = 0) {
  const at = tables.glyf + loca(g);
  if (loca(g + 1) === loca(g)) return [];
  const n = i16(at);
  if (n < 0) {
    // composite: each component placed at its offset (the quotes use no scaling)
    const out = [];
    let p = at + 10, more = true;
    while (more) {
      const flags = u16(p), comp = u16(p + 2);
      p += 4;
      let x, y;
      if (flags & 1) { x = i16(p); y = i16(p + 2); p += 4; } else { x = buf.readInt8(p); y = buf.readInt8(p + 1); p += 2; }
      if (!(flags & 2)) throw new Error('component placed by points — not handled');
      if (flags & 0x8 || flags & 0x40 || flags & 0x80) throw new Error('scaled component — not handled');
      out.push(...contoursOf(comp, dx + x, dy + y));
      more = !!(flags & 0x20);
    }
    return out;
  }
  const endPts = Array.from({ length: n }, (_, i) => u16(at + 10 + i * 2));
  const count = endPts[n - 1] + 1;
  let p = at + 10 + n * 2;
  p += 2 + u16(p); // instructions
  const flags = [];
  while (flags.length < count) {
    const f = buf[p++];
    flags.push(f);
    if (f & 8) for (let r = buf[p++]; r > 0; r--) flags.push(f);
  }
  const coords = (short, same) => {
    let v = 0;
    return flags.map((f) => {
      if (f & short) { const d = buf[p++]; v += f & same ? d : -d; } else if (!(f & same)) { v += i16(p); p += 2; }
      return v;
    });
  };
  const xs = coords(2, 16), ys = coords(4, 32);
  const contours = [];
  let start = 0;
  for (const end of endPts) {
    contours.push(xs.slice(start, end + 1).map((x, i) => ({ x: x + dx, y: ys[start + i] + dy, on: !!(flags[start + i] & 1) })));
    start = end + 1;
  }
  return contours;
}

/** The glyph as an SVG path in ems, its ink's top-left at 0,0 and y down; and its box. */
function markOf(ch) {
  const contours = contoursOf(glyphOf(ch.codePointAt(0)));
  const pts = contours.flat();
  const minX = Math.min(...pts.map((q) => q.x)), maxY = Math.max(...pts.map((q) => q.y));
  const X = (x) => +((x - minX) / unitsPerEm).toFixed(4);
  const Y = (y) => +((maxY - y) / unitsPerEm).toFixed(4);
  const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, on: true });
  const d = contours.map((c) => {
    // start on an on-curve point (or the midpoint of two off-curve ones)
    let i0 = c.findIndex((q) => q.on);
    const ring = i0 >= 0 ? [...c.slice(i0), ...c.slice(0, i0)] : c;
    const first = i0 >= 0 ? ring[0] : mid(c[c.length - 1], c[0]);
    let out = `M${X(first.x)} ${Y(first.y)}`;
    const rest = i0 >= 0 ? ring.slice(1) : ring;
    let ctrl = null;
    for (const q of [...rest, first]) {
      if (!q.on) {
        if (ctrl) { const m = mid(ctrl, q); out += `Q${X(ctrl.x)} ${Y(ctrl.y)} ${X(m.x)} ${Y(m.y)}`; }
        ctrl = q;
      } else if (ctrl) { out += `Q${X(ctrl.x)} ${Y(ctrl.y)} ${X(q.x)} ${Y(q.y)}`; ctrl = null; } else out += `L${X(q.x)} ${Y(q.y)}`;
    }
    return `${out}Z`;
  }).join('');
  const w = X(Math.max(...pts.map((q) => q.x)));
  const h = Y(Math.min(...pts.map((q) => q.y)));
  return { d, w, h };
}

const marks = { open: markOf('“'), close: markOf('”') };
console.log(JSON.stringify(marks, null, 2));
