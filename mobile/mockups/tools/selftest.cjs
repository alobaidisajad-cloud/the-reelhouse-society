/**
 * SELFTEST — the layout tool must be able to say NO.
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
const EVERY = { 'ios@1': ['HANG'], 'ios@1.35': ['HANG'], 'android@1.35': ['HANG'], 'android@2': ['HANG'] };

/** name → [the screen, { pass: expected kinds }] (a pass not listed must be clean) */
const CASES = {
  control: [box('padding:20px', T('font-size:12px;line-height:16px', 'Ozu frames a room and then leaves it.')), {}],
  // a word wider than its line, in a clamp — the tagline this tool once missed
  run: [box('width:120px', T('font-size:12px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden', 'Sensational...Daring...Unforgettable')),
    { 'ios@1': ['RUN'], 'ios@1.35': ['RUN'], 'android@1.35': ['RUN'], 'android@2': ['RUN'] }],
  // a two-line clamp in a box one line tall at large sizes — the filmography title
  cut: [box('width:110px', T('font-size:10px;line-height:13px;height:26px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden', 'In the Mood for Love', 1.2)),
    { 'ios@1.35': ['CUT'], 'android@1.35': ['CUT'], 'android@2': ['CUT'] }],
  // a box sized for iOS's ceiling that Android's ceiling-less line outgrows
  androidline: [box('width:200px', T('font-size:10px;line-height:13px;height:36px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden', 'A caption that wraps onto a second line here', 1.35)),
    { 'android@2': ['CUT'] }],
  // runs off the phone
  off: [box('padding-left:300px', T('font-size:12px;white-space:nowrap', 'SEVENTEEN LETTERS')),
    { 'ios@1': ['OFF'], 'ios@1.35': ['OFF'], 'android@1.35': ['OFF'], 'android@2': ['OFF'] }],
  // two texts drawn over each other
  clash: [box('position:relative;height:40px', T('position:absolute;top:0;left:20px;font-size:14px', 'FIRST WORDS') + T('position:absolute;top:2px;left:30px;font-size:14px', 'SECOND WORDS')),
    { 'ios@1': ['CLASH'], 'ios@1.35': ['CLASH'], 'android@1.35': ['CLASH'], 'android@2': ['CLASH'] }],
  // a label that fits its cell ONLY once shrunk, as the phone shrinks it: not a fault
  // (CERTIFIED at 12pt measures 63.7pt: unshrunk it runs 7.7pt past this 56pt cell and
  // is CUT, so this case fails if the shrink does not run; at its 0.75 floor it is 47.8)
  shrinks: [box('width:56px;overflow:hidden', T('font-size:12px;white-space:nowrap;display:block', 'CERTIFIED', 1, ' data-fit-min="0.75"')), {}],
  // a label clipped by its cell, whose shrink cannot save it
  clip: [box('width:40px;overflow:hidden', T('font-size:12px;white-space:nowrap', 'CERTIFIED 2.1K', 0, ' data-fit-min="0.75"')),
    { 'ios@1': ['CUT'], 'ios@1.35': ['CUT'], 'android@1.35': ['CUT'], 'android@2': ['CUT'] }],
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
const PASSES = ['ios@1', 'ios@1.35', 'android@1.35', 'android@2'];
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
console.log(bad ? `\n${bad} wrong — the tool cannot be trusted` : '\nthe tool says NO to every fault it exists to catch, and nothing to a clean page');
process.exit(bad ? 1 : 0);
