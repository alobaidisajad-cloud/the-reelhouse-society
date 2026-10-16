#!/usr/bin/env node
/**
 * variants.mjs — the phone as one variant run of the route walk has it (e2e/variants.json, WORKLIST
 * P0.86), for run-flows.sh to set before the walk and put back after it.
 *
 *   node e2e/variants.mjs <variant> read            the command whose answer's last word is kept
 *   node e2e/variants.mjs <variant> setup           the commands that set the variant, one a line
 *   node e2e/variants.mjs <variant> reset [<was>]   the commands that put it back, {was} filled in
 *
 * Each is an adb shell command. An unknown variant, a reset that needs what was read and is given
 * nothing, or one given a word the variant's `answers` do not hold (a failed read's error, say), is
 * refused (exit 2) before the phone is touched.
 */
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LIST = JSON.parse(readFileSync(new URL('./variants.json', import.meta.url), 'utf8')).variants;

/** The commands one step of one variant takes, or why there are none to give. */
export function commandsFor(variants, name, step, was) {
  const v = variants[name];
  if (!v) return { refused: `no variant named ${name} (the variants: ${Object.keys(variants).join(', ')})` };
  if (step === 'read') return { commands: v.read ? [v.read] : [] };
  if (step === 'setup') return { commands: v.setup };
  if (step !== 'reset') return { refused: `a step is read, setup or reset, not ${step}` };
  if (v.reset.some((c) => c.includes('{was}')) && !was) return { refused: `${name}'s reset puts back what was read, and was given nothing` };
  if (v.answers && !v.answers.includes(was)) return { refused: `${name}'s read answered ${was}, which is none of ${v.answers.join(', ')}: nothing is put back` };
  return { commands: v.reset.map((c) => c.split('{was}').join(was ?? '')) };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [name, step, was] = process.argv.slice(2);
  const { commands, refused } = commandsFor(LIST, name ?? '', step ?? '', was);
  if (refused) { console.error(refused); process.exit(2); }
  for (const c of commands) console.log(c);
}
