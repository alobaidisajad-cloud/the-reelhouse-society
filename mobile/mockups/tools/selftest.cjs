/**
 * SELFTEST — the layout tool, and the Yoga check, must be able to say NO.
 * ──────────────────────────────────────────────────────────────────────────
 * A measuring tool that has only ever printed ALL CLEAN has proved nothing.
 * This writes small screens that each carry one known fault — the faults this
 * tool exists to catch, several of them ones it once missed — plus a clean
 * control, runs `layout.cjs` over them, and fails unless every fault is
 * reported as exactly its own kind, in exactly the passes it should be, and
 * the control is reported as nothing at all.
 *
 *   node mockups/tools/selftest.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'layout-selftest-'));
const T = (style, text, cap = 0, extra = '') => `<span data-scale-cap="${cap}"${extra} style="position:relative;font-family:'Special Elite', monospace;${style}">${text}</span>`;
const box = (style, inner) => `<div style="position:relative;display:flex;flex-direction:column;${style}">${inner}</div>`;
/**
 * A bar column with a mark's count hung beside its 15pt icon, built the way
 * MarkFigure builds it: the figure spans the column, the count's box runs from
 * the column's centre (plus half the icon and the gap) to its far edge.
 */
const hung = ({ col, count, hangLeft = 11.5, hangRight = '0', marginRight = 2, open = false, fit = ' data-fit-min="0.8333"', span = 'max-width:100%;overflow:hidden;text-overflow:ellipsis' }) =>
  `<div style="display:flex;flex-direction:row;width:${col * 2}px">` +
    `<div style="flex:1;display:flex;flex-direction:column;align-items:center">` +
      `<div data-t="mark-figure" style="align-self:stretch;display:flex;align-items:center;justify-content:center;position:relative">` +
        `<div style="width:15px;height:15px;background:#777"></div>` +
        `<div data-t="${open ? 'mark-count-open' : 'mark-count'}" style="position:absolute;left:50%;right:${hangRight};top:0;bottom:0;margin-left:${hangLeft}px;margin-right:${marginRight}px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start">` +
          T(`font-size:10px;white-space:nowrap;display:block;${span}`, count, 1.2, fit) +
        `</div>` +
      `</div>` +
    `</div>` +
    // The next column: its own icon, centred, as every bar draws it.
    `<div style="flex:1;display:flex;flex-direction:column;align-items:center"><div style="width:15px;height:15px;background:#777"></div></div>` +
  `</div>`;
/**
 * A screen that scrolls, with a counter docked over its foot (as the writing
 * room's is): a line sits under the counter at the top of the scroll, and
 * `after` points of page follow it — the room it can scroll up into.
 */
const docked = (after, bar = "#111") => box('flex:1 1 0%;min-height:0',
  `<div class="vscroll" style="position:relative;display:flex;flex-direction:column;flex:1 1 0%;min-height:0">` +
    `<div style="position:relative;display:flex;flex-direction:column">` +
      `<div style="height:810px;flex-shrink:0"></div>` +
      T('font-size:14px;line-height:18px', 'THE LINE UNDER THE BAR', 1.35) +
      `<div style="height:${after}px;flex-shrink:0"></div>` +
    `</div></div>` +
  `<div style="position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;flex-direction:column;justify-content:center;background:${bar}">` +
    T('font-size:14px;line-height:18px', 'LEFT 4,000', 1.35) +
  `</div>`);
/** Two 40pt controls side by side, 10pt apart, each with the given halo toward the other. */
const pair = (a, b) => box('flex-direction:row;padding:40px;gap:10px',
  `<div data-press="0,${a},0,0" aria-label="Earlier" style="width:40px;height:40px;flex-shrink:0"></div>` +
  `<div data-press="0,0,0,${b}" aria-label="Later" style="width:40px;height:40px;flex-shrink:0"></div>`);
/** The same pair inside a card drawn at `scale` — a halo lives in its view's own coordinates, so it scales too. */
const scaledPair = (scale, a, b) => box('padding:40px',
  `<div style="transform:scale(${scale});transform-origin:0 0;display:flex;flex-direction:row;gap:10px">` +
    `<div data-press="0,${a},0,0" aria-label="Earlier" style="width:40px;height:40px;flex-shrink:0"></div>` +
    `<div data-press="0,0,0,${b}" aria-label="Later" style="width:40px;height:40px;flex-shrink:0"></div>` +
  `</div>`);
/** Two bordered 40pt controls 10pt apart, across or down: hitSlop reaches from the OUTER edge, border and all. */
const borderedPair = (dir, a, b) => box(`flex-direction:${dir};align-items:flex-start;padding:40px;gap:10px`,
  `<div data-press="${dir === 'row' ? `0,${a},0,0` : `0,0,${a},0`}" aria-label="Earlier" style="box-sizing:border-box;border:4px solid #555;width:40px;height:40px;flex-shrink:0"></div>` +
  `<div data-press="${dir === 'row' ? `0,0,0,${b}` : `${b},0,0,0`}" aria-label="Later" style="box-sizing:border-box;border:4px solid #555;width:40px;height:40px;flex-shrink:0"></div>`);
/** A card tilted in 3D, as the Pulse rail draws its side cards: a small control at the far edge above a wide one. */
const tiltedCard = (a, b) => box('padding:40px 80px',
  `<div style="transform:perspective(400px) rotateY(40deg);transform-origin:0 50%;display:flex;flex-direction:column;align-items:flex-end;gap:10px;width:260px">` +
    `<div data-press="0,0,${a},0" aria-label="Report" style="width:40px;height:40px;flex-shrink:0"></div>` +
    `<div data-press="${b},0,0,0" aria-label="Open the card" style="width:260px;height:120px;flex-shrink:0"></div>` +
  `</div>`);
/** A control in a card drawn at double size, beside a control outside the card: compared on screen, halo scaled. */
const scaledBeside = (a) => box('flex-direction:row;padding:40px;gap:10px',
  `<div style="width:80px;height:80px;flex-shrink:0"><div style="transform:scale(2);transform-origin:0 0">` +
    `<div data-press="0,${a},0,0" aria-label="Inside" style="width:40px;height:40px"></div>` +
  `</div></div>` +
  `<div data-press="0,0,0,0" aria-label="Outside" style="width:40px;height:40px;flex-shrink:0"></div>`);
const EVERY = { 'ios@1': ['HANG'], 'ios@1.35': ['HANG'], 'ios@3.1': ['HANG'], 'android@1.35': ['HANG'], 'android@2': ['HANG'] };
const ALL = (kind) => ({ 'ios@1': [kind], 'ios@1.35': [kind], 'ios@3.1': [kind], 'android@1.35': [kind], 'android@2': [kind] });

/** name → [the screen, { pass: expected kinds }] (a pass not listed must be clean) */
const CASES = {
  control: [box('padding:20px', T('font-size:12px;line-height:16px', 'Ozu frames a room and then leaves it.')), {}],
  // a word wider than its line, in a clamp — the tagline this tool once missed
  run: [box('width:120px', T('font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden', 'Sensational...Daring...Unforgettable')),
    ALL('RUN')],
  // a two-line clamp in a box one line tall at large sizes — the filmography title
  cut: [box('width:110px', T('font-size:10px;line-height:13px;height:26px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden', 'In the Mood for Love', 1.2)),
    { 'ios@1.35': ['CUT'], 'ios@3.1': ['CUT'], 'android@1.35': ['CUT'], 'android@2': ['CUT'] }],
  // a label with NO cap of its own, in a cell sized for 1.35: on a phone it grows
  // to the system's largest size (iOS 3.1, Android 2) — the app-wide 1.35 was a
  // patch no phone ever ran — so it is cut there, and only there
  uncapped: [box('width:66px;overflow:hidden', T('font-size:12px;white-space:nowrap;display:block', 'LOBBY', 0)),
    { 'ios@3.1': ['CUT'], 'android@2': ['CUT'] }],
  // the same label WITH a cap: it stops at 1.35 everywhere, and fits
  capped: [box('width:66px;overflow:hidden', T('font-size:12px;white-space:nowrap;display:block', 'LOBBY', 1.35)), {}],
  // a spaced label with no cap, in a cell it fits at iOS's 1.35: Android also
  // spaces an uncapped text × its setting, and that alone pushes it over
  androidtrack: [box('width:112px;overflow:hidden', T('font-size:10px;letter-spacing:4px;white-space:nowrap;display:block', 'ARCHIVIST', 0)),
    { 'ios@3.1': ['CUT'], 'android@1.35': ['CUT'], 'android@2': ['CUT'] }],
  // a box sized for iOS's ceiling that Android's ceiling-less line outgrows
  androidline: [box('width:200px', T('font-size:10px;line-height:13px;height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden', 'A caption that wraps onto a second line here', 1.35)),
    { 'android@2': ['CUT'] }],
  // runs off the phone
  off: [box('padding-left:300px', T('font-size:12px;white-space:nowrap', 'SEVENTEEN LETTERS')), ALL('OFF')],
  // two 40pt controls 10pt apart, each reaching 15 toward the other: the later
  // one takes taps meant for the earlier
  steal: [pair(15, 15), ALL('STEAL')],
  // the same two, each reaching half the gap: they meet, and nothing is shared
  halfgap: [pair(5, 5), {}],
  // at half size the gap is 5 and each halo 2: clear (a full-size halo would meet)…
  scaleddown: [scaledPair(0.5, 4, 4), {}],
  // …and at double size the gap is 20 and each halo 12: they overlap
  scaledup: [scaledPair(2, 6, 6), ALL('STEAL')],
  // bordered, each reaching 6 across a 10pt gap: measured from inside the
  // border they would stop short; from the outer edge, as the phone does, they overlap
  // inside a card at double size, a 6pt halo reaches 12 on screen — across the 10pt gap
  scaledbeside: [scaledBeside(6), ALL('STEAL')],
  // tilted, halos that meet exactly: clean — though the box around the tilted
  // wide control rises above the small one's halo at the far edge…
  tilted: [tiltedCard(5, 5), {}],
  // …and reaching past each other they overlap, tilted or not
  tiltedsteal: [tiltedCard(8, 8), ALL('STEAL')],
  borderacross: [borderedPair('row', 6, 6), ALL('STEAL')],
  borderdown: [borderedPair('column', 6, 6), ALL('STEAL')],
  // a control set ON another — a layer, where the one on top is meant to win
  layered: [box('position:relative;width:200px;height:120px',
    `<div data-press="15,15,15,15" aria-label="Open the card" style="position:absolute;left:0;top:0;width:200px;height:120px"></div>` +
    `<div data-press="15,15,15,15" aria-label="Save" style="position:absolute;left:150px;top:10px;width:40px;height:40px"></div>`), {}],
  // a card asked for a shadow on the same view that clips its corners: iOS
  // draws none — and the split that fixes it (the shadow on an outer host that
  // does not clip) is clean
  clipshadow: [box('padding:40px', `<div data-rn='{"overflow":"hidden","shadowOpacity":0.4,"shadowRadius":8,"shadowColor":"#000"}' style="width:100px;height:60px;overflow:hidden"></div>`), ALL('SHADOW')],
  splitshadow: [box('padding:40px', `<div data-rn='{"shadowOpacity":0.4,"shadowRadius":8,"shadowColor":"#000"}' style="width:100px;height:60px"><div data-rn='{"overflow":"hidden","elevation":4}' style="width:100px;height:60px;overflow:hidden"></div></div>`), {}],
  // a control with nothing a screen reader can say: no label, only a picture
  nameless: [box('padding:40px', `<div data-press="15,15,15,15" style="width:40px;height:40px"><div style="width:20px;height:20px;background:#777"></div></div>`), ALL('NAMELESS')],
  // a picture under a label: named by the label (a hidden child adds nothing)
  named: [box('padding:40px', `<div data-press="15,15,15,15" aria-label="Close" style="width:40px;height:40px">${T('font-size:12px', 'X', 1).replace('<span', '<span aria-hidden="true"')}</div>`), {}],
  // no label, but words inside it: iOS reads those
  namedbywords: [box('padding:40px', `<div data-press="15,15,15,15" style="width:80px;height:40px">${T('font-size:12px', 'FILE', 1)}</div>`), {}],
  // a docked bar over a scroller: a line under the bar at the top that scrolls
  // clear of it is scrolling, not a clash…
  scrollunder: [docked(200), {}],
  // …but a last line that is still under the bar scrolled to the END (no room
  // reserved for the bar) can never be read
  scrollstuck: [docked(0), ALL('UNDER')],
  // the same through a see-through bar: the words are drawn over each other
  scrollsheer: [docked(0, 'rgba(0,0,0,0.4)'), ALL('CLASH')],
  scrollsheerclear: [docked(200, 'rgba(0,0,0,0.4)'), {}],
  // a line past the fold of a scroller inside a sheet that clips: scrolled to,
  // not cut…
  scrollfold: [box('height:120px;overflow:hidden', `<div class="vscroll" style="position:relative;display:flex;flex-direction:column;flex:1 1 0%;min-height:0;overflow:hidden">` +
    `<div style="height:200px;flex-shrink:0"></div>` + T('font-size:14px;line-height:18px', 'THE LAST ACT', 1.35) + `</div>`), {}],
  // …but a line clipped by a box INSIDE the scroller is cut
  scrollcut: [box('height:300px', `<div class="vscroll" style="position:relative;display:flex;flex-direction:column;flex:1 1 0%;min-height:0">` +
    `<div style="height:20px;overflow:hidden;flex-shrink:0">` + T('font-size:14px;line-height:18px;padding-top:10px;display:block', 'HALF A LINE', 1.35) + `</div></div>`), ALL('CUT')],
  // two texts drawn over each other
  clash: [box('position:relative;height:40px', T('position:absolute;top:0;left:20px;font-size:14px', 'FIRST WORDS') + T('position:absolute;top:2px;left:30px;font-size:14px', 'SECOND WORDS')),
    ALL('CLASH')],
  // a row in a centred column, holding a mark and a one-line label that MAY shrink:
  // Yoga holds the row to the column's width, so the label ellipsises inside it.
  // (A browser let the row take its content's width and hang past the phone.)
  colcap: [box('width:300px;margin-left:80px;align-items:center',
    `<div style="position:relative;z-index:0;flex-shrink:0;display:flex;flex-direction:row;align-items:center">` +
      `<div style="position:relative;z-index:0;flex-shrink:0;display:flex;flex-direction:column;width:90px;height:18px;background:#777"></div>` +
      T('font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:1;min-width:0;display:block', 'THE HOUSE · 30 VOICES · AND MORE', 1.35) +
    `</div>`), {}],
  // the same row, but the label may NOT shrink: on the phone it truly runs off
  colcapfixed: [box('width:300px;margin-left:80px;align-items:center',
    `<div style="position:relative;z-index:0;flex-shrink:0;display:flex;flex-direction:row;align-items:center">` +
      `<div style="position:relative;z-index:0;flex-shrink:0;display:flex;flex-direction:column;width:90px;height:18px;background:#777"></div>` +
      T('font-size:14px;white-space:nowrap;flex-shrink:0;display:block', 'THE HOUSE · 30 VOICES · AND MORE', 1.35) +
    `</div>`), ALL('OFF')],
  // a box with a width OF ITS OWN, wider than its column: Yoga lets it overflow,
  // so its far end — and the word set there — really is off the phone
  colownwidth: [box('width:300px;margin-left:20px',
    `<div style="position:relative;z-index:0;flex-shrink:0;display:flex;flex-direction:row;width:450px;justify-content:flex-end">` +
      T('font-size:12px;white-space:nowrap;display:block', 'EDGE', 1.35) +
    `</div>`), ALL('OFF')],
  // a label that fits its cell ONLY once shrunk, as the phone shrinks it: not a fault
  // (CERTIFIED at 12pt measures 63.7pt: unshrunk it runs 7.7pt past this 56pt cell and
  // is CUT, so this case fails if the shrink does not run; at its 0.75 floor it is 47.8)
  shrinks: [box('width:56px;overflow:hidden', T('font-size:12px;white-space:nowrap;display:block', 'CERTIFIED', 1, ' data-fit-min="0.75"')), {}],
  // a label that cuts ITSELF short ("…") even at its floor, in a roomy column:
  // no parent clips it, and the phone still draws "CERTIF…"
  floor: [box('width:200px', T('font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;width:40px', 'CERTIFIED 2.1K', 0, ' data-fit-min="0.75"')), ALL('CUT')],
  // a label clipped by its cell, whose shrink cannot save it
  clip: [box('width:40px;overflow:hidden', T('font-size:12px;white-space:nowrap', 'CERTIFIED 2.1K', 0, ' data-fit-min="0.75"')), ALL('CUT')],
  // a count hung properly in a column with room: nothing to report
  hangclean: [hung({ col: 80, count: '12' }), {}],
  // a count laid over its own icon (no offset past the icon's half)
  hangicon: [hung({ col: 80, count: '12', hangLeft: 0 }), EVERY],
  // a count whose box runs on into the NEXT column, and whose glyphs follow it
  hangpast: [hung({ col: 40, count: '999K', hangRight: '-60px', span: '' }), EVERY],
  // a count its box is too narrow for, with no shrink: ellipsised — while its
  // glyphs still end inside the column, so ONLY the cut can report it
  hangcut: [hung({ col: 80, count: '12', hangRight: '20px', fit: '' }), EVERY],
  // a count a FRACTION too wide: 999K is 23.4px at 10px in this face, its box 23.1px.
  // Whole-pixel widths read 23 and 23 and passed it; the browser drew "99…".
  hangsub: [hung({ col: 73.2, count: '999K', fit: '' }), EVERY],
  // a count that fits only by shrinking under the floor (0.75 of 10pt)
  hangfloor: [hung({ col: 60, count: '9.9K', fit: ' data-fit-min="0.75"' }), EVERY],
  // an OPEN bar: the count runs past its column's edge, clear of the next icon — fine
  // (50pt columns: the figures end ~6pt past their own column and ~10pt short of the next icon)
  hangopen: [hung({ col: 50, count: '9.9K', open: true, hangRight: '-50%', marginRight: 11.5, span: '' }), {}],
  // an OPEN bar whose count runs onto the next icon
  hangopenicon: [hung({ col: 40, count: '999K 999K', open: true, hangRight: '-200%', marginRight: 0, span: '' }), EVERY],
};

for (const [name, [html]] of Object.entries(CASES)) fs.writeFileSync(path.join(DIR, `${name}.html`), html);
const json = path.join(DIR, 'report.json');
spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', DIR, '--json', json], { encoding: 'utf8' });
const report = JSON.parse(fs.readFileSync(json, 'utf8'));

let bad = 0;
const PASSES = ['ios@1', 'ios@1.35', 'ios@3.1', 'android@1.35', 'android@2'];
for (const [name, [, expect]] of Object.entries(CASES)) {
  for (const pass of PASSES) {
    const [platform, f] = pass.split('@');
    const key = platform === 'ios' ? `${name}@${f}` : `${name}@${platform}-${f}`;
    const got = [...new Set((report[key]?.found ?? []).filter((x) => x.kind !== 'SHORT').map((x) => x.kind))].sort();
    const want = [...(expect[pass] ?? [])].sort();
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) bad++;
    console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(12)} ${pass.padEnd(13)} want [${want}]  got [${got}]`);
  }
}
fs.rmSync(DIR, { recursive: true, force: true });

/**
 * And what the touch check MEASURED (`--sites`, `--require`): a file counts
 * only when one of its controls stood near enough to another for two halos to
 * meet. Two controls 10pt apart are measured; two 60pt apart, and a control
 * alone, are not — and requiring an unmeasured file must fail the run.
 */
const SDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sites-selftest-'));
const at = (src, gap) => box(`flex-direction:row;padding:40px;gap:${gap}px`,
  `<div data-press="0,5,0,0" aria-label="One" data-src="${src[0]}" style="width:40px;height:40px;flex-shrink:0"></div>` +
  `<div data-press="0,0,0,5" aria-label="Two" data-src="${src[1]}" style="width:40px;height:40px;flex-shrink:0"></div>`);
fs.writeFileSync(path.join(SDIR, 'near.html'), at(['src/near/A.tsx:12', 'src/near/B.tsx:40'], 10));
fs.writeFileSync(path.join(SDIR, 'far.html'), at(['src/far/C.tsx:7', 'src/far/D.tsx:9'], 60));
fs.writeFileSync(path.join(SDIR, 'alone.html'), box('padding:40px', `<div data-press="15,15,15,15" aria-label="Alone" data-src="src/alone/E.tsx:3" style="width:40px;height:40px"></div>`));
const sitesOut = path.join(SDIR, 'sites.txt');
const need = (lines) => { const f = path.join(SDIR, 'require.txt'); fs.writeFileSync(f, lines.join('\n')); return f; };
const sites = (req) => spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', SDIR, '--passes', 'ios@1', '--sites', sitesOut, '--require', need(req)], { encoding: 'utf8' });
for (const [label, req, wantStatus, wantSites] of [
  ['sites-kept', ['# the pair that stood together', 'src/near/A.tsx', 'src/near/B.tsx'], 0, 'src/near/A.tsx:12,src/near/B.tsx:40'],
  ['sites-lost', ['src/near/A.tsx', 'src/far/C.tsx', 'src/alone/E.tsx'], 1, 'src/near/A.tsx:12,src/near/B.tsx:40'],
]) {
  const r = sites(req);
  const got = fs.existsSync(sitesOut) ? fs.readFileSync(sitesOut, 'utf8').trim().split('\n').join(',') : '(none)';
  const lost = (r.stdout.match(/^LOST {2}\S+/gm) || []).length;
  const ok = r.status === wantStatus && got === wantSites && lost === (wantStatus ? 2 : 0);
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label.padEnd(12)} sites         want exit ${wantStatus} [${wantSites}]  got exit ${r.status} [${got}], ${lost} lost`);
}
fs.rmSync(SDIR, { recursive: true, force: true });

/**
 * And SMALL (asked for by name): a control whose own box is under 48 is
 * reported; one at 48 is not; one named in --allow (file + label) is excused —
 * and an --allow line with no real reason is refused outright.
 */
const XDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'small-selftest-'));
const ctl = (w, h, label, src) => box('padding:40px', `<div data-press="0,0,0,0" aria-label="${label}" data-src="${src}" style="width:${w}px;height:${h}px;flex-shrink:0"></div>`);
fs.writeFileSync(path.join(XDIR, 'small.html'), ctl(40, 40, 'Close', 'src/x/Small.tsx:3'));
fs.writeFileSync(path.join(XDIR, 'big.html'), ctl(48, 48, 'Close', 'src/x/Big.tsx:3'));
fs.writeFileSync(path.join(XDIR, 'excused.html'), ctl(40, 40, 'March 9, 2026', 'src/x/Cal.tsx:9'));
fs.writeFileSync(path.join(XDIR, 'samefile.html'), ctl(40, 40, 'Next month', 'src/x/Cal.tsx:4'));
const allow = path.join(XDIR, 'allow.txt');
fs.writeFileSync(allow, 'src/x/Cal.tsx /^[A-Z][a-z]+ \\d+, \\d{4}$/ — a day in a seven-column month on the narrowest phone, forty-two points wide and forty-eight tall\n');
const small = spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', XDIR, '--passes', 'ios@1', '--kinds', 'SMALL', '--allow', allow], { encoding: 'utf8' });
const flagged = [...new Set((small.stdout.match(/^\S+(?=\s+×1\s+1 found)/gm) || []))].sort().join(',');
const smallOk = flagged === 'samefile,small' && small.status === 1;
if (!smallOk) bad++;
console.log(`${smallOk ? 'ok  ' : 'FAIL'}  small        SMALL         want [samefile,small]  got [${flagged}] exit ${small.status}`);
fs.writeFileSync(allow, 'src/x/Cal.tsx — too short\n');
const thin = spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', XDIR, '--passes', 'ios@1', '--kinds', 'SMALL', '--allow', allow], { encoding: 'utf8' });
const thinOk = thin.status !== 0 && /must be/.test(thin.stderr);
if (!thinOk) bad++;
console.log(`${thinOk ? 'ok  ' : 'FAIL'}  small-thin   SMALL         want a refused --allow  got exit ${thin.status}`);
// --allow-short: a text cut at its floor is excused only where the source line
// it was written on matches — the title, not the copy beside it in the same file.
const srcDir = path.join(__dirname, '..', 'out', 'selftest-src');
fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, 'Card.tsx'), 'line 1\nline 2\n<Text>{film.title}</Text>\n<Text>House copy</Text>\n');
const cutAt = (words, line) => box('width:200px', T('font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;width:40px', words, 0, ` data-fit-min="0.75" data-src="mockups/out/selftest-src/Card.tsx:${line}"`));
const SH = fs.mkdtempSync(path.join(os.tmpdir(), 'short-selftest-'));
fs.writeFileSync(path.join(SH, 'title.html'), cutAt('The Shawshank Redemption', 3));
fs.writeFileSync(path.join(SH, 'copy.html'), cutAt('Talk about it with the house.', 4));
const shortAllow = path.join(SH, 'allow.txt');
fs.writeFileSync(shortAllow, 'mockups/out/selftest-src/Card.tsx @/film\\.title/ — a film title is content of any length, and the card ends a long one with an ellipsis by design\n');
const sh = spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', SH, '--passes', 'ios@1', '--allow-short', shortAllow], { encoding: 'utf8' });
const shortFlagged = [...new Set((sh.stdout.match(/^\S+(?=\s+×1\s+1 found)/gm) || []))].sort().join(',');
const shortOk = shortFlagged === 'copy';
if (!shortOk) bad++;
console.log(`${shortOk ? 'ok  ' : 'FAIL'}  allow-short  CUT           want [copy]  got [${shortFlagged}]`);
fs.writeFileSync(shortAllow, 'mockups/out/selftest-src/Card.tsx @/nothing-here/ — a pattern that names no line is an exception for nothing, and is refused\n');
const none = spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', SH, '--passes', 'ios@1', '--allow-short', shortAllow], { encoding: 'utf8' });
const noneOk = none.status !== 0 && /matches no line/.test(none.stderr);
if (!noneOk) bad++;
console.log(`${noneOk ? 'ok  ' : 'FAIL'}  allow-none   CUT           want a refused pattern  got exit ${none.status}`);
fs.rmSync(SH, { recursive: true, force: true });
fs.rmSync(srcDir, { recursive: true, force: true });
// Not asked for by name: SMALL is not reported at all.
const quiet = spawnSync(process.execPath, [path.join(__dirname, 'layout.cjs'), '--src', XDIR, '--passes', 'ios@1', '--only', 'small'], { encoding: 'utf8' });
const quietOk = !/SMALL/.test(quiet.stdout);
if (!quietOk) bad++;
console.log(`${quietOk ? 'ok  ' : 'FAIL'}  small-quiet  default kinds  want no SMALL  got ${quietOk ? 'none' : 'SMALL'}`);
fs.rmSync(XDIR, { recursive: true, force: true });

/**
 * And yoga-parity.cjs — which says whether a drawing is where the phone puts
 * it — must say NO to a box drawn in the wrong place, nothing to a right one,
 * and must lay out with React Native's settings: two pages are drawn as RN's
 * Yoga (errata on) lays them out and a W3C-strict Yoga would not, so they
 * agree only if the tool runs the phone's engine.
 */
const YDIR = fs.mkdtempSync(path.join(os.tmpdir(), 'yoga-selftest-'));
const yb = (rn, css, inner = '') =>
  `<div data-rn='${JSON.stringify(rn)}' style="position:relative;display:flex;flex-direction:${rn.flexDirection || 'column'};flex-shrink:0;${css}">${inner}</div>`;
const leaf = (w, h) => `<span data-scale-cap="0" style="position:relative;display:block;width:${w}px;height:${h}px"></span>`;
const YCASES = {
  // drawn exactly as its style says
  yogaclean: [yb({ padding: 20 }, 'padding:20px', yb({ width: 100, height: 40 }, 'width:100px;height:40px')), 0],
  // drawn 40pt wider than its style says: the phone would not draw this
  yogaoff: [yb({ padding: 20 }, 'padding:20px', yb({ width: 100, height: 40 }, 'width:140px;height:40px')), 1],
  // StretchFlexBasis: a `flex: 1` column in a row only as wide as its content,
  // in a header that centres its items. RN's Yoga grows the row across all
  // 300pt it may have (pushing the button past it — the Pulse card's fault);
  // strict Yoga leaves the column at 0 and the row at 40.
  yogastretch: [yb({ width: 300, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, 'width:300px;justify-content:space-between;align-items:center',
    yb({ flexDirection: 'row', gap: 10 }, 'gap:10px;width:300px',
      yb({ width: 30, height: 30 }, 'width:30px;height:30px') + yb({ flex: 1 }, 'flex:1 1 0%;min-width:0', leaf(50, 10))) +
    yb({ width: 16, height: 16 }, 'width:16px;height:16px')), 0],
  // AbsolutePercentAgainstInnerSize: 48% of the parent LESS its padding (12.72pt)
  yogaabspct: [yb({ height: 49, paddingTop: 10, paddingBottom: 12.5 }, 'height:49px;padding-top:10px;padding-bottom:12.5px',
    yb({ position: 'absolute', top: 0, left: 0, right: 0, height: '48%' }, 'position:absolute;top:0;left:0;right:0;height:12.72px')), 0],
};
for (const [name, [html]] of Object.entries(YCASES)) fs.writeFileSync(path.join(YDIR, `${name}.html`), html);
for (const [name, [, want]] of Object.entries(YCASES)) {
  const r = spawnSync(process.execPath, [path.join(__dirname, 'yoga-parity.cjs'), '--src', YDIR, '--only', name], { encoding: 'utf8' });
  const ok = r.status === want;
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name.padEnd(12)} yoga-parity   want ${want ? 'apart' : 'agrees'}  got ${r.status === 0 ? 'agrees' : r.status === 1 ? 'apart' : `exit ${r.status}: ${(r.stderr || '').trim().slice(0, 200)}`}`);
}
fs.rmSync(YDIR, { recursive: true, force: true });

console.log(bad ? `\n${bad} wrong — the tools cannot be trusted` : '\nthe tools say NO to every fault they exist to catch, and nothing to a clean page');
process.exit(bad ? 1 : 0);
