#!/usr/bin/env node
/**
 * arm.mjs — turns the checked-out app into one arm of the speed lab (WORKLIST P0.104).
 *
 *   node e2e/lab/arm.mjs <arm> [<arm> ...]       (run from mobile/; arms apply in order)
 *   node e2e/lab/arm.mjs --check                 (every build the lab makes checked; none written)
 *
 * A is the app as it is, and needs no arm. Each arm is a list of exact edits: an edit whose
 * text is not found exactly once stops the build, so no arm can quietly be the same app as
 * another, and e2e/__tests__/speedLab.test.ts checks every build against the tree as committed.
 *
 * The light, five scenes, each drawn on the signed-out welcome (WORKLIST P0.103). A scene's
 * `m` arm is main's light (native gradients); its `s` arm is the same scene with the light
 * as SVG, as it was before 4ab40542; N paints no light at all, every view kept in place.
 *   Ws      the welcome's own light: the room, the vignette and the seal's halo, as SVG
 *   Dm Ds   the Dispatch's lamp (hung off-centre) alone
 *   Hm Hs   the Lobby's lamp hung from a hero's hem (300 points down) alone
 *   Gm Gs   the seal's halo alone
 *   Pm Ps   a member's spotlight (the member page's own SpotlightPool, Archivist tint) alone
 *   N       no light
 *   STILL   the welcome's endless loops stilled: for the iOS simulator, whose Reduce Motion
 *           cannot be set; every iOS build carries it, so only the light differs between them
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── The edits ──

const ROOM_FILE = 'src/components/atmosphere/RoomLight.tsx';
const VIGNETTE_FILE = 'src/components/CinematicOverlays.tsx';
const HALO_FILE = 'src/components/auth/AuthChrome.tsx';
const MEMBER_FILE = 'app/user/[username].tsx';
const WELCOME_FILE = 'app/(tabs)/index.tsx';

const SVG_IMPORT = "import Svg, { Defs as SvgDefs, Ellipse as SvgEllipse, LinearGradient as SvgLinear, RadialGradient as SvgRadial, Rect as SvgRect, Stop as SvgStop } from 'react-native-svg';\n";

const ROOM_VIEW = "      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H, experimental_backgroundImage: roomLightImage(g, H) }} />\n";
const ROOM_SIGNATURE = 'export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {\n';
const VIGNETTE_STYLE = '    experimental_backgroundImage: VIGNETTE_IMAGE,\n';
const VIGNETTE_VIEW = '  return <View style={styles.vignette} pointerEvents="none" />;\n';
const HALO_VIEW = '  return <View style={{ width: size, height: size, experimental_backgroundImage: candlelightImage(size, intensity) }} pointerEvents="none" />;\n';
const SPOT_VIEW = '  return <View style={[spotStyles.wrap, { experimental_backgroundImage: spotlightImage(tint, opacity) }]} pointerEvents="none" />;\n';
const WELCOME_LIGHT = '        <RoomLight room="lobby" />\n        {readyMark}\n';

/** Each edit: in `file`, the text `from`, found exactly once, becomes `to`. */
const edit = (file, from, to) => ({ file, from, to });

// The SVGs as 4ab40542^ drew them, their names those of SVG_IMPORT.
const svgRoom = [
  edit(ROOM_FILE, "import { StyleSheet, View, useWindowDimensions } from 'react-native';\n",
    "import { StyleSheet, View, useWindowDimensions } from 'react-native';\n" + SVG_IMPORT + "import { useSvgId } from '@/src/utils/svgId';\n"),
  edit(ROOM_FILE, ROOM_SIGNATURE, ROOM_SIGNATURE + "  const id = useSvgId('');\n"),
  edit(ROOM_FILE, ROOM_VIEW, [
    '      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>',
    '        <SvgDefs>',
    '          <SvgRadial id={`pool${id}`} gradientUnits="userSpaceOnUse" cx={g.pool.cx} cy={g.pool.cy} rx={g.pool.rx} ry={g.pool.ry}>',
    '            {g.pool.stops.map(([at, a]) => (',
    "              <SvgStop key={at} offset={at} stopColor={`rgb(${g.pool.rgb.join(',')})`} stopOpacity={a} />",
    '            ))}',
    '          </SvgRadial>',
    '          <SvgLinear id={`floor${id}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={g.floor.height}>',
    '            {g.floor.stops.map(([at, a]) => (',
    '              <SvgStop key={at} offset={at} stopColor="#000" stopOpacity={a} />',
    '            ))}',
    '          </SvgLinear>',
    '          <SvgRadial id={`corners${id}`} gradientUnits="userSpaceOnUse" cx={g.corners.cx} cy={g.corners.cy} rx={g.corners.rx} ry={g.corners.ry}>',
    '            {g.corners.stops.map(([at, a]) => (',
    '              <SvgStop key={at} offset={at} stopColor="#000" stopOpacity={a} />',
    '            ))}',
    '          </SvgRadial>',
    '        </SvgDefs>',
    '        <SvgRect x={0} y={0} width={W} height={H} fill={`url(#pool${id})`} />',
    '        <SvgRect x={0} y={0} width={W} height={H} fill={`url(#floor${id})`} />',
    '        <SvgRect x={0} y={0} width={W} height={H} fill={`url(#corners${id})`} />',
    '      </Svg>',
    '',
  ].join('\n')),
];
const svgVignette = [
  edit(VIGNETTE_FILE, "import { View, StyleSheet } from 'react-native';\n", "import { View, StyleSheet } from 'react-native';\n" + SVG_IMPORT),
  edit(VIGNETTE_FILE, VIGNETTE_STYLE, ''),
  edit(VIGNETTE_FILE, VIGNETTE_VIEW, [
    '  return (',
    '    <View style={styles.vignette} pointerEvents="none">',
    '      <Svg width="100%" height="100%">',
    '        <SvgDefs>',
    '          <SvgRadial id="nitrateVignette" cx="50%" cy="50%" rx="72%" ry="58%">',
    '            <SvgStop offset="55%" stopColor="#000" stopOpacity="0" />',
    '            <SvgStop offset="100%" stopColor="#000" stopOpacity="0.34" />',
    '          </SvgRadial>',
    '        </SvgDefs>',
    '        <SvgRect x="0" y="0" width="100%" height="100%" fill="url(#nitrateVignette)" />',
    '      </Svg>',
    '    </View>',
    '  );',
    '',
  ].join('\n')),
];
const svgHalo = [
  edit(HALO_FILE, "import { LinearGradient } from 'expo-linear-gradient';\n", "import { LinearGradient } from 'expo-linear-gradient';\n" + SVG_IMPORT),
  edit(HALO_FILE, HALO_VIEW, [
    '  return (',
    '    <Svg width={size} height={size} pointerEvents="none">',
    '      <SvgDefs>',
    '        <SvgRadial id="candleHalo" cx="50%" cy="50%" r="50%">',
    '          <SvgStop offset="0%" stopColor={colors.flicker} stopOpacity={intensity} />',
    '          <SvgStop offset="42%" stopColor={colors.sepia} stopOpacity={intensity * 0.32} />',
    '          <SvgStop offset="100%" stopColor={colors.sepia} stopOpacity={0} />',
    '        </SvgRadial>',
    '      </SvgDefs>',
    '      <SvgRect x={0} y={0} width={size} height={size} fill="url(#candleHalo)" />',
    '    </Svg>',
    '  );',
    '',
  ].join('\n')),
];
const svgSpotlight = [
  edit(MEMBER_FILE, "import { spotlightImage } from '@/src/theme/light';\n", "import { spotlightImage } from '@/src/theme/light';\n" + SVG_IMPORT),
  edit(MEMBER_FILE, SPOT_VIEW, [
    '  return (',
    '    <View style={spotStyles.wrap} pointerEvents="none">',
    '      <Svg width="100%" height="100%">',
    '        <SvgDefs>',
    '          <SvgRadial id="plateSpot" cx="50%" cy="22%" rx="58%" ry="62%">',
    '            <SvgStop offset="0%" stopColor={tint} stopOpacity={String(opacity)} />',
    '            <SvgStop offset="100%" stopColor={tint} stopOpacity="0" />',
    '          </SvgRadial>',
    '        </SvgDefs>',
    '        <SvgEllipse cx="50%" cy="28%" rx="62%" ry="58%" fill="url(#plateSpot)" />',
    '      </Svg>',
    '    </View>',
    '  );',
    '',
  ].join('\n')),
];

// No light: every view stays where it is, with nothing painted in it.
const noRoom = [edit(ROOM_FILE, ROOM_VIEW, "      <View style={{ position: 'absolute', top: 0, left: 0, width: W, height: H }} />\n")];
const noVignette = [edit(VIGNETTE_FILE, VIGNETTE_STYLE, '')];
const noHalo = [edit(HALO_FILE, HALO_VIEW, '  return <View style={{ width: size, height: size }} pointerEvents="none" />;\n')];

// The other lamps, hung where the welcome's own hangs.
const lampDispatch = [edit(WELCOME_FILE, WELCOME_LIGHT, '        <RoomLight room="dispatch" />\n        {readyMark}\n')];
const lampUnderHero = [edit(WELCOME_FILE, WELCOME_LIGHT, '        <RoomLight room="lobby" hem={300} />\n        {readyMark}\n')];
// The member page draws its spotlight only once a profile loads, so it hangs on the welcome.
const spotlightOnWelcome = [
  edit(MEMBER_FILE, 'function SpotlightPool({ tint, opacity }', 'export function SpotlightPool({ tint, opacity }'),
  edit(WELCOME_FILE, "import { RoomLight } from '@/src/components/atmosphere/RoomLight';\n",
    "import { RoomLight } from '@/src/components/atmosphere/RoomLight';\nimport { SpotlightPool } from '@/app/user/[username]';\n"),
  edit(WELCOME_FILE, WELCOME_LIGHT, '        <SpotlightPool tint={colors.champagne} opacity={0.26} />\n        {readyMark}\n'),
];

// Every endless loop on the welcome stilled; the views stay.
const still = [
  edit('src/components/home/ProjectorBeam.tsx',
    'export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {\n',
    'export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {\n  if (globalThis) return null;\n'),
  edit('src/components/theme/BrassSheen.tsx',
    'export const BrassSheen = memo(function BrassSheen() {\n',
    'export const BrassSheen = memo(function BrassSheen() {\n  if (globalThis) return null;\n'),
  edit('src/components/home/VelvetRopeCTA.tsx', 'export const ShimmerRule = memo(() => {\n', 'export const ShimmerRule = memo(() => {\n    if (globalThis) return null;\n'),
  edit('src/components/auth/SocietySeal.tsx', '    if (isFocused) {', '    if (isFocused && !globalThis) {'),
];

export const ARMS = {
  Ws: [...svgRoom, ...svgVignette, ...svgHalo],
  Dm: [...lampDispatch, ...noVignette, ...noHalo],
  Ds: [...lampDispatch, ...noVignette, ...noHalo, ...svgRoom],
  Hm: [...lampUnderHero, ...noVignette, ...noHalo],
  Hs: [...lampUnderHero, ...noVignette, ...noHalo, ...svgRoom],
  Gm: [...noRoom, ...noVignette],
  Gs: [...noRoom, ...noVignette, ...svgHalo],
  Pm: [...spotlightOnWelcome, ...noVignette, ...noHalo],
  Ps: [...spotlightOnWelcome, ...noVignette, ...noHalo, ...svgSpotlight],
  N: [...noRoom, ...noVignette, ...noHalo],
  STILL: still,
};

/** The scenes the shots compare: each one's main build, its SVG build, and what it shows. */
export const SCENES = [
  { key: 'W', main: 'A', svg: 'Ws', what: "the welcome's own light (room, vignette, halo)" },
  { key: 'D', main: 'Dm', svg: 'Ds', what: "the Dispatch's lamp" },
  { key: 'H', main: 'Hm', svg: 'Hs', what: "a lamp hung from a hero's hem" },
  { key: 'G', main: 'Gm', svg: 'Gs', what: "the seal's halo" },
  { key: 'P', main: 'Pm', svg: 'Ps', what: "a member's spotlight" },
];

// ── Applying them ──

/** A file's text with LF line ends, and the ends it had (a Windows checkout has CRLF). */
const read = (path) => {
  const raw = readFileSync(path, 'utf8');
  return { eol: raw.includes('\r\n') ? '\r\n' : '\n', text: raw.replace(/\r\n/g, '\n') };
};

/**
 * Applies the arms to the tree at `root`, in order, each edit to the text the edits before it
 * left. Returns the faults; with any, nothing is written. `write: false` only checks.
 */
export function apply(arms, root, { write = true } = {}) {
  const files = new Map();
  const faults = [];
  for (const name of arms) {
    if (!ARMS[name]) { faults.push(`no arm called ${name}`); continue; }
    for (const e of ARMS[name]) {
      if (!files.has(e.file)) files.set(e.file, read(join(root, e.file)));
      const f = files.get(e.file);
      const at = f.text.indexOf(e.from);
      if (at < 0 || f.text.indexOf(e.from, at + 1) >= 0) {
        faults.push(`${name}: the text to change in ${e.file} is not there exactly once: ${JSON.stringify(e.from.slice(0, 100))}`);
        continue;
      }
      f.text = f.text.slice(0, at) + e.to + f.text.slice(at + e.from.length);
    }
  }
  if (faults.length === 0 && write) {
    for (const [file, f] of files) writeFileSync(join(root, file), f.eol === '\n' ? f.text : f.text.split('\n').join(f.eol));
  }
  return faults;
}

/** Every build the lab makes, as its arms: each alone (Android), each after STILL (iOS). */
export const BUILDS = [...Object.keys(ARMS).map((a) => [a]), ...SCENES.flatMap((s) => [s.main, s.svg]).filter((a) => a !== 'A').map((a) => ['STILL', a])];

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--check') {
  // Each build checked against the tree, nothing written: { "STILL+Ws": [faults] }.
  const faults = Object.fromEntries(BUILDS.map((arms) => [arms.join('+'), apply(arms, process.cwd(), { write: false })]));
  console.log(JSON.stringify(faults));
  process.exit(Object.values(faults).some((f) => f.length) ? 1 : 0);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arms = process.argv.slice(2);
  if (arms.length === 0) {
    console.error(`arm: name the arms to apply, of ${Object.keys(ARMS).join(' ')}`);
    process.exit(2);
  }
  const faults = apply(arms, process.cwd());
  if (faults.length) {
    for (const f of faults) console.error(`arm: ${f}`);
    process.exit(1);
  }
  console.log(`arm: ${arms.join(' + ')} applied`);
}
