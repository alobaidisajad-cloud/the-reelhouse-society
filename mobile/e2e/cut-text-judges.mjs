#!/usr/bin/env node
/**
 * cut-text-judges.mjs — the cut-text judge of the variant runs that ask for it (e2e/variants.json,
 * `judges`; WORKLIST P0.86): every Text the app said it cut (`text.cut`, src/components/text)
 * fails the run, unless e2e/cut-text-judged.json names its words and its cut, for this variant,
 * with why the cut is the design. cutTextJudged.test.ts holds every judged cut's words to the
 * code or the seeded world that still draws them, so no judgement outlives its label.
 *
 *   node e2e/cut-text-judges.mjs <device log> --judged <json> --variant <name>
 *
 * Exit 0 when every cut is judged; 1 naming each one that is not (its words, its cut, how often);
 * 2 when the log or the judged list cannot be read.
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LINE = /\[e2e\] text\.cut (\{.*\})\s*$/;

/** Every cut the log says, once each, with how often it was said. */
export function readCuts(text) {
  const seen = new Map();
  for (const l of text.split(/\r?\n/)) {
    const m = LINE.exec(l);
    if (!m) continue;
    let c;
    try { c = JSON.parse(m[1] ?? ''); } catch { continue; }
    if (typeof c?.words !== 'string' || typeof c?.cut !== 'string') continue;
    const key = `${c.cut}\t${c.words}`;
    seen.set(key, { words: c.words, cut: c.cut, times: (seen.get(key)?.times ?? 0) + 1 });
  }
  return [...seen.values()];
}

/** Each cut no judgement for this variant names, in words. */
export function judge(cuts, judged, variant) {
  const ok = (c) => judged.some((j) => j.words === c.words && j.cut === c.cut && j.variants.includes(variant));
  return cuts.filter((c) => !ok(c)).map((c) => `"${c.words}" ${c.cut} (said ${c.times} time${c.times === 1 ? '' : 's'})`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
  const log = args[0];
  const judgedFile = flag('--judged');
  const variant = flag('--variant');
  if (!log || !existsSync(log) || !judgedFile || !existsSync(judgedFile) || !variant) {
    console.error('usage: node e2e/cut-text-judges.mjs <device log> --judged <json> --variant <name>');
    process.exit(2);
  }
  let judged;
  try { judged = JSON.parse(readFileSync(judgedFile, 'utf8')).cuts; } catch (e) {
    console.error(`the judged cuts cannot be read: ${e.message}`);
    process.exit(2);
  }
  const cuts = readCuts(readFileSync(log, 'utf8'));
  const faults = judge(cuts, judged, variant);
  for (const f of faults) console.log(`✗ ${f}`);
  console.log(faults.length
    ? `${faults.length} cut${faults.length === 1 ? '' : 's'} no one has judged, of ${cuts.length} said`
    : `every cut judged: ${cuts.length} said, ${judged.filter((j) => j.variants.includes(variant)).length} judged for ${variant}`);
  process.exit(faults.length ? 1 : 0);
}
