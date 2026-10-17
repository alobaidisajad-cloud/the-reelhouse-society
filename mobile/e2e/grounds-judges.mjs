#!/usr/bin/env node
/**
 * grounds-judges.mjs — the dark-mode run's judge (WORKLIST P0.86): the app keeps its own grounds
 * and inks whatever the system's mode (app.json's userInterfaceStyle, the status bar set light), so
 * every route the dark walk captured must look as the plain walk's capture of it does. The plain
 * walk's emulator is in light mode (e2e/variants.json says how that was read), so the two modes meet.
 *
 *   node e2e/grounds-judges.mjs <plain walk dir> <dark walk dir>
 *
 * Each walk dir is a route walk's (walk.tsv and its captures, route-judges.mjs). For every route
 * captured in both, two parts of the screen are read (e2e/png.mjs), every fourth pixel:
 *   - the body (below the status bar, above the navigation bar): its mean lightness, and how much
 *     of it is near white. A ground the system turned light or dark moves both; a member's own words or a
 *     poster that loaded in one run and not the other moves them little, so the limits are wide;
 *   - the status bar: how much of it is light (its icons on the app's dark ground). Icons the
 *     system turned dark leave it under half of the plain run's.
 * A moment the system draws part of says which part is the app's (walk.tsv's fourth column):
 * above the keyboard, which Android draws in the system's own mode, is all that is read of it.
 * Every route's numbers are printed, so the limits are read against real runs.
 *
 * Exit 0 when every route holds; 1 naming each that does not; 2 when a walk cannot be read or the
 * two share no captured route.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePng } from './png.mjs';
import { findCapture, readPlan } from './route-judges.mjs';

/** Where the status bar ends and the navigation bar begins, as parts of the screen's height. */
export const STATUS_END = 0.045;
export const NAV_START = 0.93;
/** Where the app's part of a screen ends, for a moment the system draws the rest of: no keyboard reaches above the middle. */
export const PARTS = { 'above-keyboard': 0.5 };

/** Where the body that is the app's ends, for a route (above the navigation bar) or a moment's part. */
export function bodyEnd(part) {
  if (part === undefined) return NAV_START;
  if (!(part in PARTS)) throw new Error(`no part named ${part} (the parts: ${Object.keys(PARTS).join(', ')})`);
  return PARTS[part];
}
/** How far the dark run's body may move from the plain run's, either way, and how much of the icons may fade. */
export const LIMITS = { meanLight: 0.12, nearWhite: 0.15, iconsKept: 0.5 };

/** Lightness of one pixel, 0 to 1 (Rec. 709 weights). */
const lightness = (p, i) => (0.2126 * p[i] + 0.7152 * p[i + 1] + 0.0722 * p[i + 2]) / 255;

/** Mean lightness, near-white share and light share of rows [from, to) of a picture, every fourth pixel. */
export function partOf(img, from, to) {
  let sum = 0; let white = 0; let light = 0; let n = 0;
  for (let y = Math.floor(from * img.height); y < Math.floor(to * img.height); y += 4) {
    for (let x = 0; x < img.width; x += 4) {
      const l = lightness(img.pixels, (y * img.width + x) * 4);
      sum += l; n++;
      if (l > 0.85) white++;
      if (l > 0.6) light++;
    }
  }
  return n ? { meanLight: sum / n, nearWhite: white / n, light: light / n } : { meanLight: 0, nearWhite: 0, light: 0 };
}

/** What is wrong with one route's dark capture against its plain one, or null; of a moment, its `part` alone. */
export function fault(plain, dark, part) {
  const why = [];
  const b0 = partOf(plain, STATUS_END, bodyEnd(part));
  const b1 = partOf(dark, STATUS_END, bodyEnd(part));
  if (Math.abs(b1.meanLight - b0.meanLight) > LIMITS.meanLight) why.push(`its body's lightness ${b0.meanLight.toFixed(2)} → ${b1.meanLight.toFixed(2)}`);
  if (Math.abs(b1.nearWhite - b0.nearWhite) > LIMITS.nearWhite) why.push(`near white ${(b0.nearWhite * 100).toFixed(0)}% → ${(b1.nearWhite * 100).toFixed(0)}%`);
  const s0 = partOf(plain, 0, STATUS_END);
  const s1 = partOf(dark, 0, STATUS_END);
  if (s0.light > 0.005 && s1.light < s0.light * LIMITS.iconsKept) why.push(`the status bar's icons ${(s0.light * 100).toFixed(1)}% → ${(s1.light * 100).toFixed(1)}% light`);
  return why.length ? why.join('; ') : null;
}

/** Each route both walks captured: its file, its two pictures' paths, and a moment's part. */
export function pairs(plainDir, darkDir) {
  const dark = new Map(readPlan(readFileSync(join(darkDir, 'walk.tsv'), 'utf8')).map((r) => [r.file, r]));
  return readPlan(readFileSync(join(plainDir, 'walk.tsv'), 'utf8')).flatMap((p) => {
    const l = dark.get(p.file);
    if (!l) return [];
    const a = findCapture(join(plainDir, 'routes'), p.capture ?? '');
    const b = findCapture(join(darkDir, 'routes'), l.capture ?? '');
    return existsSync(a) && existsSync(b) ? [{ file: p.file, plain: a, dark: b, ...(p.part ? { part: p.part } : {}) }] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [plainDir, darkDir] = process.argv.slice(2);
  if (!plainDir || !darkDir || !existsSync(join(plainDir, 'walk.tsv')) || !existsSync(join(darkDir, 'walk.tsv'))) {
    console.error('usage: node e2e/grounds-judges.mjs <plain walk dir> <dark walk dir>, each with its walk.tsv');
    process.exit(2);
  }
  const both = pairs(plainDir, darkDir);
  if (both.length === 0) {
    console.error('the two walks share no captured route: nothing was compared, so nothing is proven');
    process.exit(2);
  }
  const faults = [];
  for (const p of both) {
    const a = decodePng(readFileSync(p.plain));
    const b = decodePng(readFileSync(p.dark));
    const [ba, bb] = [partOf(a, STATUS_END, bodyEnd(p.part)), partOf(b, STATUS_END, bodyEnd(p.part))];
    const why = fault(a, b, p.part);
    console.log(`${why ? '✗' : '✓'} ${p.file}${p.part ? ` (${p.part})` : ''}: body ${ba.meanLight.toFixed(2)}/${bb.meanLight.toFixed(2)}, white ${(ba.nearWhite * 100).toFixed(0)}%/${(bb.nearWhite * 100).toFixed(0)}%${why ? ` — ${why}` : ''}`);
    if (why) faults.push(p.file);
  }
  console.log(faults.length ? `${faults.length} of ${both.length} routes drawn otherwise in dark mode` : `every route as the plain run draws it: ${both.length}`);
  process.exit(faults.length ? 1 : 0);
}
