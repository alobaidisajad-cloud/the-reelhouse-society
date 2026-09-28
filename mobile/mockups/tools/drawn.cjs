/**
 * DRAWN — is every control in these files drawn on some screen?
 * ──────────────────────────────────────────────────────────────────────────
 * The touch checks (layout.cjs: STEAL, SMALL) measure what is drawn. A control
 * that no screen draws is measured by nothing, and nothing says so. This reads
 * the listed source files for every `<PressableScale` and asks whether any
 * drawn screen (in --src, whose name starts with --prefix) carries its site —
 * the `data-src` a drawing run writes on each control (jest.setup.ts).
 *
 *   node mockups/tools/drawn.cjs --src DIR --prefix composer FILE...
 *   exits 1 naming each control no screen draws.
 *
 * The answer to a failure is a generator state that reaches the control
 * (src/components/log/__tests__/zz-composer.gen.test.tsx), not an exception.
 */
const fs = require('fs');
const path = require('path');
const { MOBILE } = require('./harness.cjs');

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf(`--${k}`); return i >= 0 ? args.splice(i, 2)[1] : null; };
const SRC = path.resolve(opt('src') || path.join(MOBILE, 'mockups', 'out', 'screens'));
const PREFIX = opt('prefix') || '';
const files = args;
if (!files.length) { console.error('drawn.cjs: name the source files to check'); process.exit(2); }

const drawn = new Set();
const screens = fs.readdirSync(SRC).filter((f) => f.startsWith(PREFIX) && f.endsWith('.html') && !f.includes('@'));
for (const f of screens) {
  for (const m of fs.readFileSync(path.join(SRC, f), 'utf8').matchAll(/data-src="([^"]+)"/g)) drawn.add(m[1]);
}
// No sites at all (MOCKUPS unset, a broken marker) would prove nothing either way.
if (!drawn.size) { console.error(`drawn.cjs: no drawn control carries a site in ${screens.length} screens under ${SRC}`); process.exit(2); }

let missing = 0, total = 0;
for (const rel of files) {
  const raw = fs.readFileSync(path.join(MOBILE, rel), 'utf8');
  // Comments blanked in place: line numbers survive, a commented-out control is not counted.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
  for (let i = src.indexOf('<PressableScale'); i !== -1; i = src.indexOf('<PressableScale', i + 1)) {
    total++;
    const site = `${rel}:${src.slice(0, i).split('\n').length}`;
    if (!drawn.has(site)) { missing++; console.log(`NOT DRAWN  ${site}`); }
  }
}
console.log(missing ? `\n${missing} of ${total} controls drawn on no ${PREFIX || ''} screen` : `\nall ${total} controls drawn`);
process.exit(missing ? 1 : 0);
