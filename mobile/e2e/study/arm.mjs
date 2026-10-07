#!/usr/bin/env node
/**
 * arm.mjs — turns the checked-out app into one arm of the cold-start study.
 *
 *   node e2e/study/arm.mjs <B|C|D>     (run from mobile/)
 *
 * A is the app as it is. Each other arm is a list of exact edits; an edit whose
 * text is not found exactly once stops the build, so no arm can quietly be the
 * same app as another.
 *   B — the film store's start-up step prefetches nothing (the proposed fix)
 *   C — B, and the two full-screen SVGs drawn on the welcome are gone
 *       (a measurement only: what those two layers cost)
 *   D — A, with expo-image's Android prefetch made download-only for 'disk',
 *       and the start-up prefetch asking for 'disk' (proves the patch on a device)
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NM = process.env.NM ?? 'node_modules';

const FILMS = 'src/stores/films.ts';
// The block runs from the `try {` line before this anchor to PREFETCH_END.
const PREFETCH_ANCHOR = `const { ImagePrefetcher } = require('../utils/imagePrefetcher');
                        if (state.watchlist && state.watchlist.length > 0) {`;
const PREFETCH_END = `} catch { /* tmdb prefetch is best-effort */ }`;

// Matched with LF line ends whatever the checkout has (Windows checks out CRLF),
// and written back with the file's own.
const read = (file) => {
  const raw = readFileSync(file, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};
const write = (file, eol, text) => writeFileSync(file, eol === '\n' ? text : text.replace(/\n/g, eol));

function edit(file, from, to) {
  const { eol, text } = read(file);
  const at = text.indexOf(from);
  if (at < 0 || text.indexOf(from, at + 1) >= 0) {
    console.error(`arm: the text to change in ${file} is not there exactly once`);
    process.exit(1);
  }
  write(file, eol, text.slice(0, at) + to + text.slice(at + from.length));
  console.log(`arm: changed ${file}`);
}

function cut(file, anchor, end) {
  const { eol, text } = read(file);
  const at = text.indexOf(anchor);
  // From the start of the line holding the last `try {` before the anchor.
  const a = at < 0 ? -1 : text.lastIndexOf('\n', text.lastIndexOf('try {', at)) + 1;
  const b = text.indexOf(end, at);
  if (at < 0 || b < 0 || text.indexOf(anchor, at + 1) >= 0) {
    console.error(`arm: the block to cut in ${file} is not there exactly once`);
    process.exit(1);
  }
  write(file, eol, text.slice(0, a) + text.slice(b + end.length));
  console.log(`arm: cut ${b + end.length - a} characters from ${file}`);
}

const noStartupPrefetch = () => cut(FILMS, PREFETCH_ANCHOR, PREFETCH_END);

const noFullScreenSvg = () => {
  edit('src/components/CinematicOverlays.tsx',
    'export function Vignette() {\n  return (',
    'export function Vignette() {\n  if (globalThis) return null;\n  return (');
  edit('src/components/atmosphere/RoomLight.tsx',
    'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n',
    'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n  if (globalThis) return null;\n');
};

const downloadOnly = () => {
  edit('src/utils/imagePrefetcher.ts',
    'await Promise.allSettled(urlsToPrefetch.map(url => Image.prefetch(url)));',
    "await Promise.allSettled(urlsToPrefetch.map(url => Image.prefetch(url, 'disk')));");
  const kt = `${NM}/expo-image/android/src/main/java/expo/modules/image/ExpoImageModule.kt`;
  edit(kt, 'import android.util.Base64\n', 'import android.util.Base64\nimport java.io.File\n');
  edit(kt,
    `      urls.forEach {
        Glide
          .with(context)
          .load(GlideUrl(it, headers))`,
    `      urls.forEach {
        if (cachePolicy == CachePolicy.DISK) {
          // Download-only: the bytes go to the data disk cache, which a view's
          // load reads; nothing is decoded until a view asks for it.
          Glide
            .with(context)
            .downloadOnly()
            .load(GlideUrl(it, headers))
            .listener(object : RequestListener<File> {
              override fun onLoadFailed(
                e: GlideException?,
                model: Any?,
                target: Target<File>,
                isFirstResource: Boolean
              ): Boolean {
                if (!failed) {
                  failed = true
                  promise.resolve(false)
                }
                return true
              }

              override fun onResourceReady(
                resource: File,
                model: Any,
                target: Target<File>,
                dataSource: DataSource,
                isFirstResource: Boolean
              ): Boolean {
                imagesLoaded++
                if (imagesLoaded == urls.size) {
                  promise.resolve(true)
                }
                return true
              }
            })
            .submit()
          return@forEach
        }
        Glide
          .with(context)
          .load(GlideUrl(it, headers))`);
};

const ARMS = { B: [noStartupPrefetch], C: [noStartupPrefetch, noFullScreenSvg], D: [downloadOnly] };
const arm = process.argv[2];
if (!ARMS[arm]) {
  console.error('usage: node e2e/study/arm.mjs <B|C|D>');
  process.exit(2);
}
for (const step of ARMS[arm]) step();
