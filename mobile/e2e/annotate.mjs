#!/usr/bin/env node
/**
 * annotate.mjs — put a failed step's own words where they can be read.
 *
 *   node e2e/annotate.mjs "<title>" <file>
 *
 * A run's logs need a signed-in GitHub account; its annotations and summary
 * do not. So a failing step's report is raised as an error annotation (the
 * first lines, which GitHub shows on the run page and returns from its API)
 * and written whole to the run's summary.
 */
import { appendFileSync, existsSync, readFileSync } from 'node:fs';

const [title, file] = process.argv.slice(2);
if (!title || !file) {
  console.error('usage: node e2e/annotate.mjs "<title>" <file>');
  process.exit(2);
}
const text = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n').trim() : '(no output was written)';
const lines = text.split('\n');

// An annotation holds one message; GitHub encodes its line breaks as %0A.
const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
const head = lines.slice(0, 40).join('\n').slice(0, 3500);
console.log(`::error title=${escape(title).replace(/[:,]/g, ' ')}::${escape(head)}${lines.length > 40 ? '%0A… (the whole report is on the run summary)' : ''}`);

if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${title}\n\n\`\`\`\n${text.slice(0, 60000)}\n\`\`\`\n`);
}
