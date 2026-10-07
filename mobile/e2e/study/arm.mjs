#!/usr/bin/env node
/**
 * arm.mjs — turns the checked-out app into one arm of the cold-start study.
 *
 *   node e2e/study/arm.mjs <B|C|E|N|P|SOURCE|STILL>     (run from mobile/)
 *
 * A is the app as it is. Each other arm is a list of exact edits; an edit whose
 * text is not found exactly once stops the build, so no arm can quietly be the
 * same app as another.
 *   B      the film store's start-up step prefetches nothing (the proposed fix)
 *   C      B, and the welcome's two full-screen SVGs are gone (what they cost)
 *   E      B, with the room's light and the vignette drawn as native gradients
 *          (experimental_backgroundImage: a GPU shader, no bitmap) instead of SVG
 *   P      A, with expo-image's Android prefetch made download-only for 'disk'
 *          and the start-up prefetch asking for 'disk' (the patch, on a device)
 *   SOURCE expo-image built from its source, not Expo's prebuilt AAR
 *          (package.json expo.autolinking.android.buildFromSource) — S and P
 */
import { readFileSync, writeFileSync } from 'node:fs';

const NM = process.env.NM ?? 'node_modules';

// Matched with LF line ends whatever the checkout has (Windows checks out CRLF),
// and written back with the file's own.
const read = (file) => {
  const raw = readFileSync(file, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};
const write = (file, eol, text) => writeFileSync(file, eol === '\n' ? text : text.replace(/\n/g, eol));
const once = (text, part, file) => {
  const at = text.indexOf(part);
  if (at < 0 || text.indexOf(part, at + 1) >= 0) {
    console.error(`arm: the text to change in ${file} is not there exactly once:\n${part.slice(0, 120)}`);
    process.exit(1);
  }
  return at;
};

function edit(file, from, to) {
  const { eol, text } = read(file);
  const at = once(text, from, file);
  write(file, eol, text.slice(0, at) + to + text.slice(at + from.length));
  console.log(`arm: changed ${file}`);
}

/** Replaces everything from `start` up to and including `end` (the first after it). */
function block(file, start, end, to) {
  const { eol, text } = read(file);
  const a = once(text, start, file);
  const b = text.indexOf(end, a);
  if (b < 0) { console.error(`arm: no end of the block in ${file}`); process.exit(1); }
  write(file, eol, text.slice(0, a) + to + text.slice(b + end.length));
  console.log(`arm: replaced ${b + end.length - a} characters in ${file}`);
}

const noStartupPrefetch = () => {
  const file = 'src/stores/films.ts';
  const { eol, text } = read(file);
  const anchor = `const { ImagePrefetcher } = require('../utils/imagePrefetcher');
                        if (state.watchlist && state.watchlist.length > 0) {`;
  const end = '} catch { /* tmdb prefetch is best-effort */ }';
  const at = once(text, anchor, file);
  const a = text.lastIndexOf('\n', text.lastIndexOf('try {', at)) + 1;
  const b = text.indexOf(end, at);
  if (b < 0) { console.error('arm: no end of the prefetch block'); process.exit(1); }
  write(file, eol, text.slice(0, a) + text.slice(b + end.length));
  console.log(`arm: cut the start-up prefetch from ${file}`);
};

const noFullScreenSvg = () => {
  edit('src/components/CinematicOverlays.tsx',
    'export function Vignette() {\n  return (',
    'export function Vignette() {\n  if (globalThis) return null;\n  return (');
  edit('src/components/atmosphere/RoomLight.tsx',
    'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n',
    'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n  if (globalThis) return null;\n');
};

// The same three layers, top first as CSS lists them (SVG paints them bottom
// first: pool, floor, corners), each stop's alpha in its colour as SVG folds it.
const nativeGradients = () => {
  block('src/components/atmosphere/RoomLight.tsx',
    '      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>',
    '      </Svg>\n',
    `      <View
        style={{
          position: 'absolute', top: 0, left: 0, width: W, height: H,
          experimental_backgroundImage: [
            { type: 'radial-gradient', shape: 'ellipse', size: { x: g.corners.rx, y: g.corners.ry },
              position: { top: g.corners.cy, left: g.corners.cx },
              colorStops: g.corners.stops.map(([at, a]) => ({ color: \`rgba(0,0,0,\${a})\`, positions: [\`\${at * 100}%\`] })) },
            { type: 'linear-gradient', direction: 'to bottom',
              colorStops: g.floor.stops.map(([at, a]) => ({ color: \`rgba(0,0,0,\${a})\`, positions: [\`\${at * 100}%\`] })) },
            { type: 'radial-gradient', shape: 'ellipse', size: { x: g.pool.rx, y: g.pool.ry },
              position: { top: g.pool.cy, left: g.pool.cx },
              colorStops: g.pool.stops.map(([at, a]) => ({ color: \`rgba(\${g.pool.rgb.join(',')},\${a})\`, positions: [\`\${at * 100}%\`] })) },
          ],
        } as any}
      />
`);
  // The seal's halo: a circle of radius half the box, as SVG's r="50%" on a square.
  block('src/components/auth/AuthChrome.tsx',
    '    <Svg width={size} height={size} pointerEvents="none">',
    '    </Svg>\n',
    `    <View
      pointerEvents="none"
      style={{
        width: size, height: size,
        experimental_backgroundImage: [
          { type: 'radial-gradient', shape: 'circle', size: { x: size / 2, y: size / 2 },
            position: { top: '50%', left: '50%' },
            colorStops: [
              { color: \`rgba(240,232,176,\${intensity})\`, positions: ['0%'] },
              { color: \`rgba(184,137,26,\${intensity * 0.32})\`, positions: ['42%'] },
              { color: 'rgba(184,137,26,0)', positions: ['100%'] },
            ] },
        ],
      } as any}
    />
`);
  block('src/components/CinematicOverlays.tsx',
    '      <Svg width="100%" height="100%">',
    '      </Svg>\n',
    `      <View
        style={[StyleSheet.absoluteFill, {
          experimental_backgroundImage: [
            { type: 'radial-gradient', shape: 'ellipse', size: { x: '72%', y: '58%' },
              position: { top: '50%', left: '50%' },
              colorStops: [{ color: 'rgba(0,0,0,0)', positions: ['55%'] }, { color: 'rgba(0,0,0,0.34)', positions: ['100%'] }] },
          ],
        }] as any}
      />
`);
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

const fromSource = () => {
  const file = 'package.json';
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  pkg.expo = pkg.expo ?? {};
  pkg.expo.autolinking = pkg.expo.autolinking ?? {};
  pkg.expo.autolinking.android = { ...(pkg.expo.autolinking.android ?? {}), buildFromSource: ['expo-image'] };
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log('arm: expo-image builds from source');
};

// For screenshots where the system's reduce-motion cannot be set (the iOS
// simulator): every endless loop on the welcome is stilled, in both builds
// compared, so only the light can differ between them.
const still = () => {
  edit('src/components/home/ProjectorBeam.tsx',
    'export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {\n',
    'export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {\n  if (globalThis) return null;\n');
  edit('src/components/theme/BrassSheen.tsx',
    'export const BrassSheen = memo(function BrassSheen() {\n',
    'export const BrassSheen = memo(function BrassSheen() {\n  if (globalThis) return null;\n');
  edit('src/components/home/VelvetRopeCTA.tsx',
    'export const ShimmerRule = memo(() => {\n',
    'export const ShimmerRule = memo(() => {\n    if (globalThis) return null;\n');
  edit('src/components/auth/SocietySeal.tsx', '    if (isFocused) {', '    if (isFocused && !globalThis) {');
};

// N: no light at all — the room, the vignette AND the seal's halo — the ground
// the screenshots measure the light against.
const noHalo = () => edit('src/components/auth/AuthChrome.tsx',
  '    <Svg width={size} height={size} pointerEvents="none">',
  '    globalThis ? null : <Svg width={size} height={size} pointerEvents="none">');

const ARMS = {
  N: [noStartupPrefetch, noFullScreenSvg, noHalo],
  STILL: [still],
  B: [noStartupPrefetch],
  C: [noStartupPrefetch, noFullScreenSvg],
  E: [noStartupPrefetch, nativeGradients],
  P: [downloadOnly],
  SOURCE: [fromSource],
};
const arm = process.argv[2];
if (!ARMS[arm]) {
  console.error('usage: node e2e/study/arm.mjs <B|C|E|N|P|SOURCE|STILL>');
  process.exit(2);
}
for (const step of ARMS[arm]) step();
