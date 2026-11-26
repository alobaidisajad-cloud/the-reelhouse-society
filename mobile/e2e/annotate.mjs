#!/usr/bin/env node
/**
 * annotate.mjs — put a failed step's own words where they can be read.
 *
 *   node e2e/annotate.mjs "<title>" <file> [error|warning|notice|summary|table] [--drop <regex>]
 *
 * A run's logs need a signed-in GitHub account; its annotations and summary
 * do not. So a failing step's report is raised as an error annotation (the
 * first lines, which GitHub shows on the run page and returns from its API)
 * and written whole to the run's summary. --drop leaves lines that report
 * nothing (a layout report's "clean" screens) out of the annotation, so its
 * forty lines are the findings; --first puts the lines it matches (a report's
 * verdicts) before the rest (their diagnostics), so no verdict is cut for them. `summary` writes the summary only: GitHub keeps
 * ten annotations of each kind per step, and run-flows.sh sends the rest there
 * rather than lose them. `table` writes the summary alone too, the file as the
 * markdown it is (a table, not a block of text).
 *
 * Everything leaving the run passes through here, so every seeded account's
 * password (each E2E_<WHO>_PASSWORD, new on every run) is replaced with ••• in
 * both — whichever report carried it. GitHub masks it too; this does not lean
 * on that.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const option = (name) => { const at = args.indexOf(name); return at === -1 ? null : new RegExp(args.splice(at, 2)[1]); };
const drop = option('--drop');
const first = option('--first');
const [title, file, level = 'error'] = args;
if (!title || !file || !['error', 'warning', 'notice', 'summary', 'table'].includes(level)) {
  console.error('usage: node e2e/annotate.mjs "<title>" <file> [error|warning|notice|summary|table] [--drop <regex>] [--first <regex>]');
  process.exit(2);
}
const secrets = Object.entries(process.env).filter(([k, v]) => /^E2E_[A-Z]+_PASSWORD$/.test(k) && v).map(([, v]) => v);
const redact = (s) => secrets.reduce((t, secret) => t.split(secret).join('•••'), s);
const text = redact(existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : '(no output was written)');
const lines = text.split('\n').filter((l) => !drop || !drop.test(l));

/** Characters an annotation keeps: the runner cuts a longer message (4096). */
const ROOM = 3500;
/**
 * The annotation's lines: the first forty, whole lines within its room. With --first, the lines it
 * matches lead, in their order, then the others: a report's verdicts before its diagnostics, so a
 * verdict past forty lines of another's diagnostics is still read (nightly 45829548435: the keyboard
 * room's window lines filled the forty, and the failing probe's verdict was cut).
 */
function headOf(all, lead = null) {
  const ordered = lead ? [...all.filter((l) => lead.test(l)), ...all.filter((l) => !lead.test(l))] : all;
  const kept = [];
  let used = 0;
  for (const l of ordered.slice(0, 40)) {
    if (used + l.length + 1 > ROOM) break;
    kept.push(l);
    used += l.length + 1;
  }
  // One line longer than the room is kept as far as it fits, never dropped whole.
  if (!kept.length && ordered.length) kept.push(ordered[0].slice(0, ROOM));
  return { kept, cut: kept.join('\n').length < ordered.join('\n').length };
}

if (level !== 'summary' && level !== 'table') {
  // An annotation holds one message; GitHub encodes its line breaks as %0A.
  const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  const { kept, cut } = headOf(lines, first);
  console.log(`::${level} title=${escape(title).replace(/[:,]/g, ' ')}::${escape(kept.join('\n'))}${cut ? '%0A… (the whole report is on the run summary)' : ''}`);
}

if (process.env.GITHUB_STEP_SUMMARY) {
  const body = level === 'table' ? `${text.slice(0, 60000)}\n` : `\`\`\`\n${text.slice(0, 60000)}\n\`\`\`\n`;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${title}\n\n${body}`);
}
