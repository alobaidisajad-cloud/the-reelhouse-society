#!/usr/bin/env node
/**
 * glide-log-level.mjs — the built app tells Glide to log its errors only.
 *
 *   node e2e/glide-log-level.mjs <dexdump -d of the APK's classes*.dex>
 *
 * expo-image sets Glide's log level once, in ExpoImageAppGlideModule.applyOptions:
 * ERROR, unless the Gradle property EXPO_ALLOW_GLIDE_LOGS turns logging on.
 * Expo SDK 54 ships expo-image ready-built, and that build was made with it ON
 * (its BuildConfig.ALLOW_GLIDE_LOGS is true): Glide logged every image the app
 * loaded, address and all, in every release. package.json's
 * expo.autolinking.android.buildFromSource has expo-image compiled here
 * instead, with the property off. This reads the answer from the app itself:
 * the level the compiled method hands to GlideBuilder.setLogLevel.
 *
 * Prints its report; exits 1 unless that method is found once and the level
 * is a constant 6 (android.util.Log.ERROR).
 */
import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const LEVELS = { 2: 'VERBOSE', 3: 'DEBUG', 4: 'INFO', 5: 'WARN', 6: 'ERROR', 7: 'ASSERT' };
const METHOD = 'expo.modules.image.ExpoImageAppGlideModule.applyOptions:';

/**
 * Every compiled applyOptions of expo-image's Glide module in dexdump -d text,
 * with the level each hands to setLogLevel: a number, or null when it is not
 * one constant (a branch, or a value from elsewhere).
 */
export function readGlideLevels(text) {
  const found = [];
  let body = null;
  for (const line of text.split(/\r?\n/)) {
    if (line.includes(`|[`) && line.includes(METHOD)) { body = []; found.push(body); continue; }
    if (!body) continue;
    if (line.includes('|[') || /^\s*(Virtual|Direct) methods|^\s*#\d+\s+:/.test(line)) { body = null; continue; }
    const insn = /\|[0-9a-f]{4}: (.*)$/.exec(line);
    if (insn) body.push(insn[1]);
    if (insn && /^return/.test(insn[1])) body = null;
  }
  return found.map((insns) => {
    const regs = {};
    let level = null;
    let branched = false;
    for (const i of insns) {
      if (/^(if-|goto|packed-switch|sparse-switch)/.test(i)) branched = true;
      const c = /^const(?:\/4|\/16)? (v\d+), #int (-?\d+)/.exec(i);
      if (c) { regs[c[1]] = Number(c[2]); continue; }
      const call = /^invoke-virtual \{v\d+, (v\d+)\}, Lcom\/bumptech\/glide\/GlideBuilder;\.setLogLevel:\(I\)/.exec(i);
      if (call) level = branched ? null : (regs[call[1]] ?? null);
    }
    return level;
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2];
  if (!file) {
    console.error('usage: node e2e/glide-log-level.mjs <dexdump -d output>');
    process.exit(2);
  }
  const levels = readGlideLevels(existsSync(file) ? readFileSync(file, 'utf8') : '');
  const name = (l) => (l === null ? 'not one constant' : `${l} (${LEVELS[l] ?? 'unknown'})`);
  if (levels.length === 1 && levels[0] === 6) {
    console.log('Glide logs errors only: ExpoImageAppGlideModule.applyOptions sets level 6 (ERROR).');
    process.exit(0);
  }
  console.log([
    levels.length === 0
      ? 'ExpoImageAppGlideModule.applyOptions is not in the APK, so nothing shows what Glide logs.'
      : `Glide's log level in the APK: ${levels.map(name).join(', ')}${levels.length > 1 ? ` (${levels.length} copies of the method)` : ''} — not 6 (ERROR).`,
    'Below ERROR, Glide logs every image the app loads, address and all.',
    'expo-image must be built from source (package.json: expo.autolinking.android.buildFromSource), with EXPO_ALLOW_GLIDE_LOGS unset.',
  ].join('\n'));
  process.exit(1);
}
