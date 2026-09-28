#!/usr/bin/env node
/**
 * annotate.mjs — put a failed step's own words where they can be read.
 *
 *   node e2e/annotate.mjs "<title>" <file> [error|warning|notice] [--drop <regex>]
 *
 * A run's logs need a signed-in GitHub account; its annotations and summary
 * do not. So a failing step's report is raised as an error annotation (the
 * first lines, which GitHub shows on the run page and returns from its API)
 * and written whole to the run's summary. --drop leaves lines that report
 * nothing (a layout report's "clean" screens) out of the annotation, so its
 * forty lines are the findings.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const at = args.indexOf('--drop');
const drop = at === -1 ? null : new RegExp(args.splice(at, 2)[1]);
const [title, file, level = 'error'] = args;
if (!title || !file || !['error', 'warning', 'notice'].includes(level)) {
  console.error('usage: node e2e/annotate.mjs "<title>" <file> [error|warning|notice] [--drop <regex>]');
  process.exit(2);
}
const text = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : '(no output was written)';
const lines = text.split('\n').filter((l) => !drop || !drop.test(l));

// An annotation holds one message; GitHub encodes its line breaks as %0A.
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const head = lines.slice(0, 40).join('\n').slice(0, 3500);
console.log(`::${level} title=${escape(title).replace(/[:,]/g, ' ')}::${escape(head)}${lines.length > 40 ? '%0A… (the whole report is on the run summary)' : ''}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${title}\n\n\`\`\`\n${text.slice(0, 60000)}\n\`\`\`\n`);
}
