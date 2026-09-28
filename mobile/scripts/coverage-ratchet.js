/**
 * coverage-ratchet.js — One-Way Coverage Gate, PER DIRECTORY
 * ──────────────────────────────────────────────────────────
 * Reads Jest's coverage summary and compares it with .coverage-baseline.json:
 * any metric below baseline (less a small tolerance) exits non-zero, failing CI;
 * any improvement raises the baseline itself.
 *
 * Usage: node scripts/coverage-ratchet.js
 * Run AFTER: npx jest --ci --coverage
 *
 * PER DIRECTORY the thresholds name, plus the total: an average over thousands
 * of lines hides one directory losing twenty points. The jest floors are the
 * hard floor, re-based by hand; this is the live one-way gate. (A test that a
 * floor sits near actual would fail on every improvement; a ratchet does not.)
 */
const fs = require('fs');
const path = require('path');

const SUMMARY_PATH = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const BASELINE_PATH = path.join(__dirname, '..', '.coverage-baseline.json');
const TOLERANCE = 0.5; // Allow a small drop for PBT non-determinism.

if (!fs.existsSync(SUMMARY_PATH)) {
  console.error('❌ No coverage report found at coverage/coverage-summary.json');
  console.error('   Run: npx jest --ci --coverage --forceExit');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
const metrics = ['lines', 'branches', 'functions', 'statements'];

/**
 * The groups tracked, in the SAME shape jest.config.js uses so the two cannot
 * describe different things. `total` is kept under its old flat key so an
 * existing baseline file still means what it meant.
 *
 * Order matters for reporting only; `src/components/dispatch/` is listed before
 * `src/components/` so the narrower name reads first.
 */
const GROUPS = [
  ['total', () => true],
  ['./src/components/dispatch/', (f) => f.includes('/src/components/dispatch/')],
  ['./src/components/', (f) => f.includes('/src/components/')],
  ['./src/utils/', (f) => f.includes('/src/utils/')],
  ['./src/stores/', (f) => f.includes('/src/stores/')],
  ['./src/services/', (f) => f.includes('/src/services/')],
  ['./src/features/', (f) => f.includes('/src/features/')],
  ['./src/hooks/', (f) => f.includes('/src/hooks/')],
  ['./src/lib/', (f) => f.includes('/src/lib/')],
  ['./app/', (f) => f.includes('/mobile/app/')],
];

/** Aggregate covered/total across every file a group matches. */
function measure(match) {
  const acc = {};
  metrics.forEach((m) => { acc[m] = { covered: 0, total: 0 }; });
  for (const [file, m] of Object.entries(summary)) {
    if (file === 'total') continue;
    const rel = file.replace(/\\/g, '/');
    if (!match(rel)) continue;
    metrics.forEach((k) => { acc[k].covered += m[k].covered; acc[k].total += m[k].total; });
  }
  const out = {};
  metrics.forEach((k) => {
    out[k] = acc[k].total ? Number(((acc[k].covered / acc[k].total) * 100).toFixed(2)) : 0;
  });
  return out;
}

const current = {};
for (const [key, match] of GROUPS) current[key] = measure(match);

// ── Load, migrate, or seed the baseline ────────────────────────────────────
// A flat baseline ({ lines, branches, … }) is read as the `total` group, the rest
// seeded, so an old checkout upgrades without a false "everything improved".
let baseline = {};
let seeded = false;
if (fs.existsSync(BASELINE_PATH)) {
  const raw = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const isFlat = typeof raw.lines === 'number';
  if (isFlat) {
    baseline = { total: raw };
    seeded = true;
    console.log('📐 Baseline was global-only; keeping it as `total` and seeding each directory.');
  } else {
    baseline = raw;
  }
} else {
  seeded = true;
  console.log('📐 No baseline found; seeding from the current run.');
}

// Any group with no recorded baseline starts at what it measures today. A group
// added later must not read as a regression from zero, nor as a free pass.
for (const [key] of GROUPS) {
  if (!baseline[key]) { baseline[key] = { ...current[key] }; seeded = true; }
}

const regressions = [];
const improvements = [];

for (const [key] of GROUPS) {
  for (const metric of metrics) {
    const now = current[key][metric];
    const was = baseline[key][metric] || 0;
    if (now < was - TOLERANCE) {
      regressions.push(`  ${key} ${metric}: ${was.toFixed(1)}% → ${now.toFixed(1)}% (↓${(was - now).toFixed(1)}%)`);
    } else if (now > was + 0.1) {
      improvements.push(`  ${key} ${metric}: ${was.toFixed(1)}% → ${now.toFixed(1)}% (↑${(now - was).toFixed(1)}%)`);
    }
  }
}

if (regressions.length > 0) {
  console.error('❌ Coverage regression detected — PR blocked:\n');
  regressions.forEach((r) => console.error(r));
  console.error('\n   Fix: Add tests to cover the new/modified code.');
  console.error('   A whole directory can slide while the global average holds — that is');
  console.error('   why each one is tracked separately.');
  console.error('   Baseline: ' + BASELINE_PATH);
  process.exit(1);
}

const write = () => {
  const next = {};
  for (const [key] of GROUPS) next[key] = { ...current[key] };
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(next, null, 2) + '\n');
};

if (improvements.length > 0) {
  console.log('✅ Coverage improved:\n');
  improvements.forEach((i) => console.log(i));
  write();
  console.log('\n   📝 Baseline updated automatically.');
} else if (seeded) {
  write();
  console.log('✅ Coverage gate passed. Baseline written for every tracked directory.');
} else {
  console.log(`✅ Coverage gate passed (no regression across ${GROUPS.length} tracked groups).`);
}
