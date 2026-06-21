/**
 * coverage-ratchet.js — One-Way Coverage Gate
 * ────────────────────────────────────────────
 * Reads coverage-summary.json and compares against .coverage-baseline.json.
 * If any metric drops below baseline (with 0.5% tolerance for PBT flakiness),
 * the script exits non-zero — failing CI.
 * If metrics improve, updates the baseline automatically.
 *
 * Usage: node scripts/coverage-ratchet.js
 * Run AFTER: npx jest --ci --coverage
 */
const fs = require('fs');
const path = require('path');

const SUMMARY_PATH = path.join(__dirname, '..', 'coverage', 'coverage-summary.json');
const BASELINE_PATH = path.join(__dirname, '..', '.coverage-baseline.json');
const TOLERANCE = 0.5; // Allow 0.5% drop for PBT non-determinism

if (!fs.existsSync(SUMMARY_PATH)) {
  console.error('❌ No coverage report found at coverage/coverage-summary.json');
  console.error('   Run: npx jest --ci --coverage --forceExit');
  process.exit(1);
}

const summary = JSON.parse(fs.readFileSync(SUMMARY_PATH, 'utf8'));
const current = summary.total;

const metrics = ['lines', 'branches', 'functions', 'statements'];

// Load or initialize baseline
let baseline = {};
if (fs.existsSync(BASELINE_PATH)) {
  baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
} else {
  // First run — seed baseline from current
  metrics.forEach(m => { baseline[m] = current[m].pct; });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + '\n');
  console.log('✅ Coverage baseline initialized:');
  metrics.forEach(m => console.log(`   ${m}: ${baseline[m].toFixed(1)}%`));
  process.exit(0);
}

const regressions = [];
const improvements = [];

for (const metric of metrics) {
  const now = current[metric].pct;
  const was = baseline[metric] || 0;

  if (now < was - TOLERANCE) {
    regressions.push(`  ${metric}: ${was.toFixed(1)}% → ${now.toFixed(1)}% (↓${(was - now).toFixed(1)}%)`);
  } else if (now > was + 0.1) {
    improvements.push(`  ${metric}: ${was.toFixed(1)}% → ${now.toFixed(1)}% (↑${(now - was).toFixed(1)}%)`);
  }
}

if (regressions.length > 0) {
  console.error('❌ Coverage regression detected — PR blocked:\n');
  regressions.forEach(r => console.error(r));
  console.error('\n   Fix: Add tests to cover the new/modified code.');
  console.error('   Baseline: ' + BASELINE_PATH);
  process.exit(1);
}

if (improvements.length > 0) {
  console.log('✅ Coverage improved:\n');
  improvements.forEach(i => console.log(i));
  // Auto-update baseline (one-way ratchet)
  const newBaseline = {};
  metrics.forEach(m => { newBaseline[m] = current[m].pct; });
  fs.writeFileSync(BASELINE_PATH, JSON.stringify(newBaseline, null, 2) + '\n');
  console.log('\n   📝 Baseline updated automatically.');
} else {
  console.log('✅ Coverage gate passed (no regression).');
}
