#!/usr/bin/env node
/**
 * arm.mjs — turns the checked-out app into one arm of the cold-start study.
 *
 *   node e2e/study/arm.mjs <B|C|E|N|P|SOURCE|STILL|LPs|LPn|LFs|LFn|LCs|LCn|LVs|LVn|LHs|LHn>     (run from mobile/)
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

// The native light, as CSS strings — the form the app will ship (and the form
// zz-render.lib draws). Layers top first as CSS lists them; SVG paints them
// bottom first: pool, floor, corners. The pool's centre hangs ABOVE the screen
// (cy < 0), and React Native's Android side drops a negative position
// (LengthPercentage.setFromDynamic: value >= 0, else null → the default centre),
// so it is given from the bottom edge: `at left X bottom (H − cy)`, positive.
// Each native arm logs what React Native parsed ("[study] bg").
const LOG_PARSED = (what, expr) =>
  "(() => { const v = " + expr + "; console.warn('[study] bg " + what + " ' + JSON.stringify({ ratio: require('react-native').PixelRatio.get(), css: v, parsed: require('react-native/Libraries/StyleSheet/processBackgroundImage').default(v) })); return v; })()";
const ROOM_LAYERS = {
  corners: '`radial-gradient(ellipse ${g.corners.rx}px ${g.corners.ry}px at ${g.corners.cx}px ${g.corners.cy}px, ${g.corners.stops.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(", ")})`',
  floor: '`linear-gradient(to bottom, ${g.floor.stops.map(([at, a]) => `rgba(0,0,0,${a}) ${at * 100}%`).join(", ")})`',
  pool: '`radial-gradient(ellipse ${g.pool.rx}px ${g.pool.ry}px at left ${g.pool.cx}px bottom ${H - g.pool.cy}px, ${g.pool.stops.map(([at, a]) => `rgba(${g.pool.rgb.join(",")},${a}) ${at * 100}%`).join(", ")})`',
};
const nativeRoom = (layers = ['corners', 'floor', 'pool']) => () => block('src/components/atmosphere/RoomLight.tsx',
  '      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>',
  '      </Svg>\n',
  '      <View\n' +
  '        style={{\n' +
  "          position: 'absolute', top: 0, left: 0, width: W, height: H,\n" +
  '          experimental_backgroundImage: ' +
  LOG_PARSED("room " + layers.join('+') + " W=' + W + ' H=' + H + '", '[' + layers.map((l) => ROOM_LAYERS[l]).join(', ') + '].join(", ")') + ',\n' +
  '        } as any}\n' +
  '      />\n');
// The SVG room light with only one of its three rects drawn.
const svgRoomOnly = (keep) => () => {
  for (const layer of ['pool', 'floor', 'corners']) {
    if (layer === keep) continue;
    edit('src/components/atmosphere/RoomLight.tsx',
      '        <Rect x={0} y={0} width={W} height={H} fill={`url(#' + layer + '${id})`} />\n', '');
  }
};
// The seal's halo: a circle of radius half the box, as SVG's r="50%" on a square.
const nativeHalo = () => block('src/components/auth/AuthChrome.tsx',
  '    <Svg width={size} height={size} pointerEvents="none">',
  '    </Svg>\n',
  '    <View\n' +
  '      pointerEvents="none"\n' +
  '      style={{\n' +
  '        width: size, height: size,\n' +
  '        experimental_backgroundImage: ' +
  LOG_PARSED("halo size=' + size + '", '`radial-gradient(circle ${size / 2}px at 50% 50%, rgba(240,232,176,${intensity}) 0%, rgba(184,137,26,${intensity * 0.32}) 42%, rgba(184,137,26,0) 100%)`') + ',\n' +
  '      } as any}\n' +
  '    />\n');
const nativeVignette = () => block('src/components/CinematicOverlays.tsx',
  '      <Svg width="100%" height="100%">',
  '      </Svg>\n',
  '      <View\n' +
  '        style={[StyleSheet.absoluteFill, {\n' +
  '          experimental_backgroundImage: ' +
  LOG_PARSED('vignette', "'radial-gradient(ellipse 72% 58% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.34) 100%)'") + ',\n' +
  '        }] as any}\n' +
  '      />\n');
const nativeGradients = () => { nativeRoom()(); nativeHalo(); nativeVignette(); };
const noRoom = () => edit('src/components/atmosphere/RoomLight.tsx',
  'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n',
  'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n  if (globalThis) return null;\n');
const noVignette = () => edit('src/components/CinematicOverlays.tsx',
  'export function Vignette() {\n  return (',
  'export function Vignette() {\n  if (globalThis) return null;\n  return (');

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

// The launch crash (run 8): withTiming copies every key of its config, so
// `easing: undefined` replaces the default and the first frame calls undefined.
const motionFix = () => edit('src/hooks/useArrival.ts',
  'withTiming(1, { duration, easing, reduceMotion: ReduceMotion.System })',
  'withTiming(1, easing ? { duration, easing, reduceMotion: ReduceMotion.System } : { duration, reduceMotion: ReduceMotion.System })');

const ARMS = {
  MOTIONFIX: [motionFix],
  N: [noStartupPrefetch, noFullScreenSvg, noHalo],
  STILL: [still],
  B: [noStartupPrefetch],
  C: [noStartupPrefetch, noFullScreenSvg],
  E: [noStartupPrefetch, nativeGradients],
  P: [downloadOnly],
  SOURCE: [fromSource],
  // One light at a time, SVG against native, everything else off (vs N).
  LPs: [noStartupPrefetch, noVignette, noHalo, svgRoomOnly('pool')],
  LPn: [noStartupPrefetch, noVignette, noHalo, nativeRoom(['pool'])],
  LFs: [noStartupPrefetch, noVignette, noHalo, svgRoomOnly('floor')],
  LFn: [noStartupPrefetch, noVignette, noHalo, nativeRoom(['floor'])],
  LCs: [noStartupPrefetch, noVignette, noHalo, svgRoomOnly('corners')],
  LCn: [noStartupPrefetch, noVignette, noHalo, nativeRoom(['corners'])],
  LVs: [noStartupPrefetch, noRoom, noHalo],
  LVn: [noStartupPrefetch, noRoom, noHalo, nativeVignette],
  LHs: [noStartupPrefetch, noRoom, noVignette],
  LHn: [noStartupPrefetch, noRoom, noVignette, nativeHalo],
};
const arm = process.argv[2];
if (!ARMS[arm]) {
  console.error('usage: node e2e/study/arm.mjs <B|C|E|N|P|SOURCE|STILL|LPs|LPn|LFs|LFn|LCs|LCn|LVs|LVn|LHs|LHn>');
  process.exit(2);
}
for (const step of ARMS[arm]) step();
