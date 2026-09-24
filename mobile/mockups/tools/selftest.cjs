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
