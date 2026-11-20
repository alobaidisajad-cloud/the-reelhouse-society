#!/usr/bin/env node
/**
 * align.cjs — edges and baselines that almost line up, on the drawn pages.
 *
 *   node mockups/tools/align.cjs [--src DIR] [--only a,b] [--width W] [--passes ios@1,android@2]
 *        [--json FILE] [--check] [--lower]
 *
 * A finished page lines its words up exactly or sets them clearly apart; two edges a point or two
 * apart read as a mistake. Every word on a drawn page (mockups/out/screens, or the captures with
 * --src) is laid out as the phone grows it (harness.cjs, `open`) and read for:
 *   EDGE      two texts stacked within NEAR_GAP of each other whose left edges (or, both set right,
 *             right edges; or, both centred, centres) sit more than SNAP and at most NEAR apart
 *   BASELINE  two texts side by side in one row, within NEAR_GAP across, whose first baselines sit
 *             more than SNAP and at most NEAR apart
 * SNAP is what the phone's own pixel snapping can move (a third of a point at 3×); past NEAR the
 * two are set apart on purpose. Each fault names both texts' source lines (data-src). --check holds
 * each source file to its count in mockups/finish-record.json (section `align`, a new file: none);
 * --lower writes the counts that fell. Exits 1 on a fault only with --check.
 */
const fs = require('fs');
const path = require('path');
const { chromium, open, screens, shrinkToFit, MOBILE } = require('./harness.cjs');
const { ratchet } = require('./source.cjs');

/** At or under this the phone's own pixel snapping can move an edge: not a fault. */
const SNAP = 0.5;
/** Over this two edges are set apart on purpose. */
const NEAR = 3;
/** How far apart, down or across, two texts may be and still be read as one column or one row. */
const NEAR_GAP = 40;

/** In the page: every live text's edges, centre and first baseline, with its source line. */
function readTexts() {
  const phone = document.querySelector('.phone').getBoundingClientRect();
  const opacity = (e) => { let o = 1; for (let x = e; x && x.nodeType === 1; x = x.parentElement) o *= +getComputedStyle(x).opacity; return o; };
  const out = [];
  for (const e of document.querySelectorAll('span[data-scale-cap]')) {
    if (![...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const cs = getComputedStyle(e);
    if (opacity(e) <= 0.05 || cs.visibility === 'hidden') continue;
    const range = document.createRange();
    range.selectNodeContents(e);
    const lines = [...range.getClientRects()].filter((q) => q.width > 0.5 && q.height > 0.5);
    if (!lines.length) continue;
    const g = range.getBoundingClientRect();
    if (g.right < phone.left - 1000 || g.left > phone.right + 1000) continue;
    // The first baseline: where a zero-size probe set at the start of the text sits.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
    e.insertBefore(probe, e.firstChild);
    const baseline = probe.getBoundingClientRect().bottom;
    probe.remove();
    const align = cs.textAlign === 'right' || cs.textAlign === 'end' ? 'right' : cs.textAlign === 'center' ? 'center' : 'left';
    out.push({ left: g.left, right: g.right, top: g.top, bottom: g.bottom, baseline, align,
      site: e.closest('[data-src]')?.dataset.src ?? null, said: e.textContent.trim().replace(/\s+/g, ' ').slice(0, 40) });
  }
  return out;
}

/** Every near miss among one page's texts: { kind, by, a, b }. */
function nearMisses(texts, { snap = SNAP, near = NEAR, gap = NEAR_GAP } = {}) {
  const found = [];
  const miss = (d) => Math.abs(d) > snap && Math.abs(d) <= near;
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const a = texts[i];
      const b = texts[j];
      const overlapDown = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      const overlapAcross = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const shorter = Math.min(a.bottom - a.top, b.bottom - b.top);
      const sameRow = overlapDown >= 0.5 * shorter;
      if (!sameRow) {
        const apart = Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom);
        if (apart > gap) continue;
        const d = a.align === 'right' && b.align === 'right' ? b.right - a.right
          : a.align === 'center' && b.align === 'center' ? (b.left + b.right) / 2 - (a.left + a.right) / 2
            : b.left - a.left;
        const edge = a.align === b.align && a.align !== 'left' ? (a.align === 'right' ? 'right edges' : 'centres') : 'left edges';
        if (miss(d)) found.push({ kind: 'EDGE', by: `${edge} ${Math.abs(d).toFixed(1)}pt apart`, a, b });
      } else if (overlapAcross <= 0 && -overlapAcross <= gap) {
        const d = b.baseline - a.baseline;
        if (miss(d)) found.push({ kind: 'BASELINE', by: `baselines ${Math.abs(d).toFixed(1)}pt apart`, a, b });
      }
    }
  }
  return found;
}

const say = (t) => `"${t.said}"${t.site ? ` [${t.site}]` : ''}`;

async function main(argv) {
  const opt = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
  const src = path.resolve(opt('--src', path.join(MOBILE, 'mockups', 'out', 'screens')));
  const width = Number(opt('--width', '390'));
  const passes = opt('--passes', 'ios@1').split(',').map((p) => { const [platform, f] = p.split('@'); return { platform, factor: Number(f) }; });
  const only = opt('--only', null)?.split(',');
  if (!fs.existsSync(src)) { console.error(`no drawn pages at ${src}: draw them first (mockups/README.md)`); return 2; }
  const names = screens(src, only);
  if (!names.length) { console.error(`no drawn pages in ${src}`); return 2; }
  const browser = await chromium.launch();
  const all = [];
  try {
    for (const name of names) {
      for (const p of passes) {
        const page = await open(browser, path.join(src, `${name}.html`), { width, factor: p.factor, platform: p.platform });
        await shrinkToFit(page);
        const texts = await page.evaluate(readTexts);
        await page.close();
        for (const f of nearMisses(texts)) all.push({ page: name, pass: `${p.platform}@${p.factor}`, ...f });
      }
    }
  } finally { await browser.close(); }
  const files = {};
  for (const f of all) {
    const file = (f.a.site ?? f.b.site ?? `(no source) ${f.page}`).replace(/:\d+$/, '');
    files[file] = files[file] ?? { off: 0, offs: [] };
    files[file].off += 1;
    files[file].offs.push(`${f.page} ${f.pass}: ${f.kind} ${f.by}: ${say(f.a)} / ${say(f.b)}`);
  }
  if (opt('--json', null)) fs.writeFileSync(opt('--json'), `${JSON.stringify({ pages: names.length, passes, faults: all }, null, 2)}\n`);
  for (const f of all) console.log(`${f.kind.padEnd(8)} ${f.page} ${f.pass}: ${f.by}: ${say(f.a)} / ${say(f.b)}`);
  console.log(`${names.length} pages × ${passes.length} passes: ${all.filter((f) => f.kind === 'EDGE').length} EDGE, ${all.filter((f) => f.kind === 'BASELINE').length} BASELINE`);
  return ratchet('align', files, argv, 'near misses of edge or baseline');
}

if (require.main === module) main(process.argv.slice(2)).then((c) => { process.exitCode = c; }, (e) => { console.error(e); process.exitCode = 2; });

module.exports = { SNAP, NEAR, NEAR_GAP, readTexts, nearMisses };
