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
 *
 * The Reel's layers (WORKLIST P0.111), each switched off alone, signed in (scrolls.sh opens and
 * scrolls the Reel on each build, against A):
 *   Rw      no floor                 Rl  no room lamp
 *   Rt      the top bar as scrolled, moved by nothing          Rs  no scroll bar
 *   R0      all of them
 * (The lamp and the wash kept as textures, once the arm Rh, ship: speed lab 39901452779. The
 * projector beam, the pulses and the curate button's sheen left the Reel when its light was
 * calmed, WORKLIST P0.110; their arms, Rb and Rp, went with them.)
 *
 * The Reel's cards, part by part (R0 gave the page's layers nothing, speed lab 40046819617: the
 * cost is in the cards), in two runs of at most four arms, each fitting its step:
 *   Cs      no paper on the card     Ck  no rounded clip
 *   Cb      the same paper, painted as the view's own background
 *   Cn      the paper as the front face's own background: one fill, no layer over the card's ground
 *   C0      both: the card on the page's own ground
 * (Its washes and edge light became one opaque paper after speed lab 40147693423; Ce, the edge
 * light alone, went with them.)
 *   Cp      no poster                Ct  the title not shrunk to fit
 *   Cr      no review                Ca  no action deck
 *
 * Any screen opened with the boot's background reads begun 1.5 s later (Bd); with the query cache
 * never written (Qp), or never read back at launch (Qr); with React's own render times written (Rf,
 * built last); with each stretch the thread is held, each answer's body and each slow parse written (Jt);
 * and so timed, with the boot's parts begun 3 s later: the store's library and the rank check (JBr), the
 * live notices (JBt), the reads Bd moves (JBd), all three (JBa). With both timings (RJ), and the
 * Dispatch's first page so timed: every pressable a plain one (RPs), the post's icons left out (RPi).
 *
 * The house's lit edge (EDGE_LIT), each part taken off everywhere, on a stack (LAB_ARM_SCREEN=stack):
 *   Kx      no inset highlight       Kg  no face gradient        K0  neither
 * A stack's page, part by part (LAB_ARM_SCREEN=stack):
 *   Sv      the hero's veil not held still (its Skia canvas not redrawn as it scrolls)
 *   Sd      the hero not drifting     Sk  the posters' cards unclipped   Sp  no posters
 *
 * The Dispatch's posts, part by part (LAB_ARM_SCREEN=dispatch):
 *   Ea      no action bar            Eb  no byline               Er  no rank rule
 *   Es      a take's words without their soft breaks             E0  all four
 *
 * The salon opened cold (LAB_ARM_SCREEN=salon):
 * (The Lobby under it drawn only once first seen, Lz, shipped: speed lab 40172265454, the salon
 * opened 461 ms sooner with 18 MB less; its wall alone, Lq, went with it.)
 *   Lc      the live channel not joined  Lr  the room not marked read
 *   Lp      the room's presses as plain views
 *   Lb      the list drawn from its top, not its foot
 *   Ls0     all four
 *
 * The Dispatch's opening (WORKLIST P0.112) is opened and scrolled as the Reel's arms are
 * (scrolls.sh, LAB_ARM_SCREEN=dispatch). (Its page no longer waiting for the member's marks,
 * once the arm F0, ships: speed lab 39898420669, 1.3 s sooner; Fv, the marks asked first, gave
 * nothing.)
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

// The Reel's layers, each switched off alone, so its opening and its scroll name what each costs.
const REEL_FILE = 'app/(tabs)/reels.tsx';
const TOPBAR_FILE = 'src/components/layout/TopNavBar.tsx';
const SCROLL_PROGRESS = '    const scrollProgress = Math.min(1, Math.max(0, globalScrollY.value / 100));\n';

const reelNoWash = [edit(REEL_FILE, [
  "      {/* The room's floor, thinned so the lamp's light shows through. */}",
  '      <LinearGradient',
  '        testID="reel-floor"',
  "        colors={[colors.ink, 'rgba(13,11,9,1)', colors.soot]}",
  '        locations={[0, 0.4, 1]}',
  '        style={[StyleSheet.absoluteFill, WASH]}',
  '        renderToHardwareTextureAndroid={seen}',
  '      />',
  '',
].join('\n'), '')];
const reelNoLamp = [edit(REEL_FILE, '      <RoomLight room="reel" />\n      {readyMark}\n', '      {readyMark}\n')];
// The top bar drawn as it is once scrolled, and moved by nothing.
const reelBarStill = [
  edit(TOPBAR_FILE, '  const animatedProps = useAnimatedProps(() => {\n' + SCROLL_PROGRESS,
    '  const animatedProps = useAnimatedProps(() => {\n    const scrollProgress = 1;\n'),
  edit(TOPBAR_FILE, '  const animatedBlurStyle = useAnimatedStyle(() => {\n' + SCROLL_PROGRESS,
    '  const animatedBlurStyle = useAnimatedStyle(() => {\n    const scrollProgress = 1;\n'),
];
const reelNoScrollbar = [
  edit('src/components/reels/ReelsFeedList.tsx', '      <CinematicScrollbar scrollY={overallLogsScrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={topPad} bottomInset={bottomInset} />\n', ''),
  edit('src/components/reels/ReelsStackList.tsx', '      <CinematicScrollbar scrollY={stacksScrollY} scrollHeight={scrollHeight} viewHeight={viewHeight} isScrolling={isScrolling} topInset={topPad} bottomInset={bottomInset} />\n', ''),
];



/** The Reel's arms: each layer alone, and all of them (R0, the floor). */
export const REEL_ARMS = ['Rw', 'Rl', 'Rt', 'Rs', 'R0'];

// The Reel's cards, part by part (R0 gave the page's layers nothing: the cost is in the cards).
// Two runs, at most four arms each, so each fits its step: the card's layers, then what it holds.
const CARD_FILE = 'src/components/feed/ActivityCard.tsx';
const cardNoShell = [edit(CARD_FILE,
  'const ActivityCardShell = ({ children, isPremium, isAuteur }: { children: React.ReactNode, isPremium: boolean, isAuteur: boolean }) => {\n',
  'const ActivityCardShell = ({ children, isPremium, isAuteur }: { children: React.ReactNode, isPremium: boolean, isAuteur: boolean }) => {\n  if (globalThis) return <>{children}</>;\n')];
// Cb: the same paper, in the same box, painted by React Native's own background (a shaded rectangle)
// rather than expo-linear-gradient's view, which draws an anti-aliased, dithered path and makes its
// shader again whenever a recycled card is bound (speed lab 40167463635: the paper off, Cs, p90 -950).
const cardPaperNative = [edit(CARD_FILE, [
  '      <LinearGradient',
  '        colors={paper.colors}',
  '        locations={paper.locations}',
  '        style={[StyleSheet.absoluteFill, s.paperLine, { borderTopColor: paper.line }]}',
  '      />',
  '',
].join('\n'), [
  '      <View',
  '        style={[StyleSheet.absoluteFill, s.paperLine, { borderTopColor: paper.line,',
  '          experimental_backgroundImage: `linear-gradient(180deg, ${paper.colors.map((c, i) => `${c} ${paper.locations[i] * 100}%`).join(\', \')})` }]}',
  '      />',
  '',
].join('\n'))];
// Cn: the paper as the front face's own background, one fill: the card's ground is not painted
// beneath it (only once the back is mounted, for the flip), and no layer of its own lies over
// that ground (speed lab 40176377824: painted natively in its own layer, Cb, -50; no paper, Cs, -450).
const cardPaperIsTheFace = [
  edit(CARD_FILE, [
    '      <LinearGradient',
    '        colors={paper.colors}',
    '        locations={paper.locations}',
    '        style={[StyleSheet.absoluteFill, s.paperLine, { borderTopColor: paper.line }]}',
    '      />',
    '',
  ].join('\n'), ''),
  edit(CARD_FILE, '      <View style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur]} shouldRasterizeIOS={!flipped}>\n',
    "      <View style={[s.card, isPremium && s.cardPremium, isAuteur && s.cardAuteur, !backMounted && { backgroundColor: 'transparent' }]} shouldRasterizeIOS={!flipped}>\n"),
  edit(CARD_FILE, '          style={backMounted ? frontStyle : undefined}\n', [
    '          style={[(() => {',
    '            const paper = isAuteur ? PAPER.auteur : isPremium ? PAPER.premium : PAPER.plain;',
    '            const stops = paper.colors.map((c, i) => `${c} ${(paper.locations[i] ?? 0) * 100}%`).join(\', \');',
    '            return { experimental_backgroundImage: `linear-gradient(180deg, ${paper.line} 0px, ${paper.line} 1px, transparent 1px), linear-gradient(180deg, ${stops})` };',
    '          })(), backMounted ? frontStyle : undefined]}',
    '',
  ].join('\n')),
];
const cardNoClip = [edit(CARD_FILE, "    borderColor: 'rgba(184,137,26,0.4)',\n    overflow: 'hidden',\n", "    borderColor: 'rgba(184,137,26,0.4)',\n")];
const cardNoPoster = [edit(CARD_FILE,
  '              <PosterFrame filmId={item.film_id} filmTitle={item.film_title} posterPath={item.poster_path} isPremium={isPremium} isAuteur={isAuteur} onPress={handleFilmPress} />\n', '')];
const cardTitleUnfitted = [edit(CARD_FILE,
  ' numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>{item.film_title}', ' numberOfLines={3}>{item.film_title}')];
const cardNoReview = [edit(CARD_FILE,
  '              <ReviewContent item={item} isPremium={isPremium} isAuteur={isAuteur} onPress={handleLogPress} />\n', '')];
const cardNoDeck = [edit(CARD_FILE, [
  '              <ActionDeck',
  '                itemId={item.id}',
  '                filmId={item.film_id}',
  '                filmTitle={item.film_title}',
  '                posterPath={item.poster_path ?? null}',
  '                year={item.year ?? undefined}',
  '                ownerUsername={item.username}',
  '                ownerId={item.user_id}',
  '                certifyCount={item.certify_count}',
  '                critiqueCount={item.critique_count}',
  '              />',
  '',
].join('\n'), '')];

/** The card's layers, each alone, and both (C0); then what it holds, each alone. */
export const CARD_LAYER_ARMS = ['Cs', 'Cb', 'Cn', 'Ck', 'C0'];
export const CARD_PART_ARMS = ['Cp', 'Ct', 'Cr', 'Ca'];

// The Dispatch's posts, part by part (speed lab 40046819617: ready 1453 over its 1160, one task of
// 910 ms as the paper first draws). The lab's filings are takes by Archivists.
const POST_FILE = 'src/components/dispatch/paper/PaperPost.tsx';
const postNoActions = [edit(POST_FILE, [
  '      {!withheld && !docked && (',
  '        <PaperActions',
  '          certifyCount={certifyCount} commentCount={commentCount}',
  '          certified={certified} saved={saved} dimmed={pending}',
  '          certifyKnown={certifyKnown} saveKnown={saveKnown}',
  '          onCertify={onCertify} onCritique={onCritique}',
  '          onShare={onShare} onSave={onSave}',
  '        />',
  '      )}',
  '',
].join('\n'), '')];
const postNoByline = [edit(POST_FILE, '                {noByline ? null : (\n', '                {noByline || globalThis ? null : (\n')];
const postNoRankRule = [edit(POST_FILE, "          {tier === 'archivist' ? (\n", "          {tier === 'archivist' && !globalThis ? (\n")];
const postNoSoftBreak = [edit(POST_FILE, 'TAKE — </Text>{softBreak(body)}', 'TAKE — </Text>{body}')];

/** The Dispatch's posts: each part alone, and all four (E0). */
export const POST_ARMS = ['Ea', 'Eb', 'Er', 'Es', 'E0'];

// Bd: the boot's background reads (the member's notices, follows and marks) begin 1.5 s after the
// boot, so the first screen's own answer is taken in first. Speed lab 40172265454: the Dispatch's
// posts answered in 0.5 s, and were taken in with five more answers at once, after the thread was
// free. (A sampled profile was tried first: speed lab 40183157672 showed release Hermes carries no
// sampling profiler; none of the calls on its HermesInternal starts or writes one.)
const BOOT_FILE = 'src/providers/AppBootstrapper.tsx';
const bootReadsWait = [
  edit(BOOT_FILE, '        void hydrateFollowing();\n        // The member\'s marks, whole: every film logged and saved, not the pages read (marksLedger).\n        void readMarks();\n',
    '        setTimeout(() => { void hydrateFollowing(); void readMarks(); }, 1500);\n'),
  edit(BOOT_FILE, "        useNotificationStore.getState().fetchNotifications()\n          .catch(e => logger.warn('[Bootstrapper] Notices read failed:', e));\n",
    "        setTimeout(() => { useNotificationStore.getState().fetchNotifications().catch(e => logger.warn('[Bootstrapper] Notices read failed:', e)); }, 1500);\n"),
];

// The query cache, written whole on the thread (JSON, its bytes counted a character at a time, then
// stored) after each change, and read whole at launch. Speed lab 40191043799: the Dispatch's posts
// answered at 0.9 s and were taken in at 1.9 s, the thread held meanwhile. Qp: never written; Qr:
// never read back.
const QUERY_FILE = 'src/lib/queryClient.ts';
const cacheNotWritten = [edit(QUERY_FILE, '  persistClient: async (client: PersistedClient) => {\n    try {\n',
  '  persistClient: async (client: PersistedClient) => {\n    if (globalThis) return;\n    try {\n')];
const cacheNotRead = [edit(QUERY_FILE, '  restoreClient: async () => {\n    try {\n',
  '  restoreClient: async () => {\n    if (globalThis) return undefined;\n    try {\n')];

// Rf: where React's own time goes as a screen opens. Speed lab 40198489341 cleared the query cache
// (read in 2 ms, written in 22 at most); the Dispatch still takes its answer in a second after it
// came. The build takes React Native's profiling renderer (its production one keeps no timings), and
// React's Profiler around the whole app and the Dispatch writes each commit over 8 ms: which tree,
// mount or update, its ms, and the wall clock it ended at. Its metro change outlives `git checkout
// -- src app`, so Rf is built last.
const rendersTimed = [
  edit('metro.config.js', '  const resolve = upstream ?? context.resolveRequest;\n',
    "  const resolve = upstream ?? context.resolveRequest;\n  if (moduleName.includes('ReactFabric-prod')) moduleName = moduleName.replace('ReactFabric-prod', 'ReactFabric-profiling');\n"),
  edit('app/_layout.tsx', "import { useCallback, useEffect, useState } from 'react';\n",
    "import { Profiler, useCallback, useEffect, useState } from 'react';\n"),
  edit('app/_layout.tsx', 'SplashScreen.preventAutoHideAsync();\n', [
    'SplashScreen.preventAutoHideAsync();',
    'const labRendered = (id: string, phase: string, ms: number) => {',
    '  if (ms > 8) console.warn(`[e2e] lab.render ${JSON.stringify({ id, phase, ms: Math.round(ms), wall: Date.now() })}`);',
    '};',
    '',
  ].join('\n')),
  edit('app/_layout.tsx', '        <AppBootstrapper>\n', '        <Profiler id="app" onRender={labRendered}><AppBootstrapper>\n'),
  edit('app/_layout.tsx', '        </AppBootstrapper>\n', '        </AppBootstrapper></Profiler>\n'),
  edit('app/(tabs)/dispatch.tsx', "import { useCallback, useEffect, useMemo, useRef } from 'react';\n",
    "import { Profiler, useCallback, useEffect, useMemo, useRef } from 'react';\n"),
  edit('app/(tabs)/dispatch.tsx', '    <FrozenTab>\n', [
    '    <Profiler id="dispatch" onRender={(id: string, phase: string, ms: number) => {',
    '      if (ms > 8) console.warn(`[e2e] lab.render ${JSON.stringify({ id, phase, ms: Math.round(ms), wall: Date.now() })}`);',
    '    }}>',
    '    <FrozenTab>',
    '',
  ].join('\n')),
  edit('app/(tabs)/dispatch.tsx', '    </FrozenTab>\n', '    </FrozenTab>\n    </Profiler>\n'),
];

// Jt: what holds the thread between an answer's arrival and its being taken in. Speed lab 40207877489
// (Rf): the Dispatch's posts came at 0.3-0.45 s and were taken in 16-520 ms later, React's own
// commits a small part of it. The build writes each stretch the thread was held over 40 ms (a 10 ms
// tick come late), each answer's body as it is read (how long the read waited, its length) and each
// JSON parse over 5 ms.
const LIMIT_FN = 'export const fetchWithinLimit: typeof fetch = async (input, init) => {\n';
const threadTimed = [
  edit('src/lib/supabase.ts', LIMIT_FN, [
    'let labTick = Date.now();',
    'setInterval(() => {',
    '  const now = Date.now();',
    '  if (now - labTick > 50) console.warn(`[e2e] lab.held ${JSON.stringify({ ms: now - labTick - 10, wall: now })}`);',
    '  labTick = now;',
    '}, 10);',
    'const labParse = JSON.parse;',
    'JSON.parse = ((text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown) => {',
    '  const t = Date.now();',
    '  const value = labParse(text, reviver);',
    '  if (Date.now() - t > 5) console.warn(`[e2e] lab.json ${JSON.stringify({ ms: Date.now() - t, chars: text.length, wall: Date.now() })}`);',
    '  return value;',
    '}) as typeof JSON.parse;',
    '',
    LIMIT_FN,
  ].join('\n')),
  // The client reads each answer whole as it comes (fetchWithinLimit): the read is timed there.
  edit('src/lib/supabase.ts', '    const body = NO_BODY.has(res.status) ? null : await res.text();\n', [
    '    const asked = Date.now();',
    '    const body = NO_BODY.has(res.status) ? null : await res.text();',
    "    console.warn(`[e2e] lab.body ${JSON.stringify({ path: url.split('?')[0].split('/').pop(), askedAfter: 0, readMs: Date.now() - asked, chars: body?.length ?? 0, wall: Date.now() })}`);",
    '',
  ].join('\n')),
];

// The boot's work, each part begun 3 s later, with the thread timed (Jt). Speed lab 40214986837
// (Jt): from 0.15-0.4 s after the Dispatch began reading, the thread was held 0.2-0.9 s at a
// stretch before its posts answered, React's own commits a small part of it (Rf). JBr: the store's
// library set up and the rank checked later; JBt: the live notices later; JBd: the reads Bd moves;
// JBa: all three, so what is held besides is the screen's own.
const rankLater = [edit(BOOT_FILE, '        try {\n          await initRevenueCat(currentUser.id);\n',
  '        if (globalThis) setTimeout(() => { void initRevenueCat(currentUser.id).then(() => reconcileRank()); }, 3000);\n        else try {\n          await initRevenueCat(currentUser.id);\n')];
const liveLater = [edit(BOOT_FILE, '          Promise.resolve(useNotificationStore.getState().setupRealtime()).catch(e => {\n',
  '          (globalThis ? new Promise((r) => setTimeout(r, 3000)) : Promise.resolve()).then(() => useNotificationStore.getState().setupRealtime()).catch(e => {\n')];
const readsLater = bootReadsWait.map((e) => ({ ...e, to: e.to.replaceAll('1500', '3000') }));

// The Dispatch's first page drawn, part by part, with React's commits (Rf) and the thread (Jt)
// timed. Rf: the page's first commit with its posts took about 160 ms. Each post holds some six
// pressables, each with its own animated scale set up as it mounts, and four drawn icons. RPs:
// every pressable a plain one, no scale; RPi: the post's four icons left out.
const PRESS_FILE = 'src/components/PressableScale.tsx';
const pressablesPlain = [
  edit(PRESS_FILE, '  const scale = useSharedValue(1);\n', '  const scale = { value: 1 as unknown };\n'),
  edit(PRESS_FILE, '  const animatedStyle = useAnimatedStyle(() => ({\n    transform: [{ scale: scale.value }],\n  }));\n', ''),
  edit(PRESS_FILE, '    <AnimatedPressable\n', '    <Pressable\n'),
  edit(PRESS_FILE, '    </AnimatedPressable>\n', '    </Pressable>\n'),
  edit(PRESS_FILE, '      style={[style, animatedStyle]}\n', '      style={style}\n'),
];
const postIconsGone = [edit(POST_FILE, "import { Heart, MessageSquare, Share2, Bookmark } from 'lucide-react-native';\n",
  'const Heart = (_: object) => null;\nconst MessageSquare = Heart;\nconst Share2 = Heart;\nconst Bookmark = Heart;\n')];

// A stack's page, part by part (speed lab 40174299190: the lit edge off everywhere, K0, gave its
// slowest frames 100 ms of the 75% slow UI frames it holds against the control's 35%).
const STACK_FILE = 'app/stacks/[id].tsx';
const stackVeilStill = [edit(STACK_FILE, ' lifted={heroLifted} />', ' />')];
const stackHeroStill = [edit(STACK_FILE, '        { translateY: heroDrift.value },\n', '        { translateY: 0 },\n')];
const stackCardsUnclipped = [edit(STACK_FILE, "  filmCard: { ...EDGE_LIT, borderRadius: 2, overflow: 'hidden', ", '  filmCard: { ...EDGE_LIT, borderRadius: 2, ')];
const stackNoPosters = [edit(STACK_FILE, "<RemoteImage uri={tmdb.poster(item.poster_path, 'w342')}", '<RemoteImage uri={null}')];

// The house's lit edge (EDGE_LIT, on some fifty kinds of surface), in its two parts, each taken off
// everywhere: Android draws the inset highlight by clipping to the surface's rounded outline on
// every frame it replays, and the card's edge alone held the Reel's slowest frames 225-325 ms
// (speed lab 40147693423, Ce). Measured on a stack's page (LAB_ARM_SCREEN=stack), whose slow frames
// stood 17 points over the control's (speed lab 40157142171).
const LIGHT_FILE = 'src/theme/light.ts';
const EDGE_HIGHLIGHT = '  boxShadow: `inset 0px 1px 0px 0px ${EDGE.highlight}`,\n';
const EDGE_FACE = '  experimental_backgroundImage: `linear-gradient(180deg, ${EDGE.face} 0%, rgba(255,230,186,0) ${EDGE.faceTo * 100}%)`,\n';
const edgeNoHighlight = [edit(LIGHT_FILE, EDGE_HIGHLIGHT, '')];
const edgeNoFace = [edit(LIGHT_FILE, EDGE_FACE, '')];
const edgeNone = [edit(LIGHT_FILE, EDGE_HIGHLIGHT + EDGE_FACE, '')];

// The salon's own opening (speed lab 40157142171: under Settings the Lobby is ready at 501 ms, under
// the salon at 1134, the room at 1601; holding the Lobby's wall back, Lq, gave 170 ms, not called,
// and 17 MB). What the room itself does as it opens, each switched off alone, and all four (Ls0).
const SALON_FILE = 'app/lounge/[id].tsx';
const roomNotLive = [edit(SALON_FILE, '    if (!id || !listening) return;\n', '    if (globalThis || !id || !listening) return;\n')];
const roomNotMarked = [edit(SALON_FILE, '    fetchMessages(id);\n    markRead(id);\n    return () => { markRead(id); };\n', '    fetchMessages(id);\n    return () => {};\n')];
const roomPlainPresses = [edit(SALON_FILE, "import PressableScale from '@/src/components/PressableScale';\n",
  'const PressableScale = ({ style, children }: React.ComponentProps<typeof View> & Record<string, unknown>) => <View style={style}>{children}</View>;\n')];
const roomFromTheTop = [edit(SALON_FILE, '          maintainVisibleContentPosition={{ startRenderingFromBottom: true, autoscrollToBottomThreshold: 0.2 }}\n', '')];

// The React Compiler on (P0.117): every rule it reads holds, and the suite passes under it but for
// probes that counted redraws it now skips. Whether it opens and scrolls the app faster is this arm's.
const compilerOn = [edit('app.json', '      "typedRoutes": true\n', '      "typedRoutes": true,\n      "reactCompiler": true\n')];

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
  Rw: reelNoWash,
  Rl: reelNoLamp,
  Rt: reelBarStill,
  Rs: reelNoScrollbar,
  R0: [...reelNoWash, ...reelNoLamp, ...reelBarStill, ...reelNoScrollbar],
  Cs: cardNoShell,
  Cb: cardPaperNative,
  Cn: cardPaperIsTheFace,
  Ck: cardNoClip,
  C0: [...cardNoShell, ...cardNoClip],
  Cp: cardNoPoster,
  Ct: cardTitleUnfitted,
  Cr: cardNoReview,
  Ca: cardNoDeck,
  Ea: postNoActions,
  Eb: postNoByline,
  Er: postNoRankRule,
  Es: postNoSoftBreak,
  E0: [...postNoActions, ...postNoByline, ...postNoRankRule, ...postNoSoftBreak],
  Bd: bootReadsWait,
  Qp: cacheNotWritten,
  Qr: cacheNotRead,
  Rf: rendersTimed,
  Jt: threadTimed,
  JBr: [...threadTimed, ...rankLater],
  JBt: [...threadTimed, ...liveLater],
  JBd: [...threadTimed, ...readsLater],
  JBa: [...threadTimed, ...rankLater, ...liveLater, ...readsLater],
  RJ: [...rendersTimed, ...threadTimed],
  RPs: [...rendersTimed, ...threadTimed, ...pressablesPlain],
  RPi: [...rendersTimed, ...threadTimed, ...postIconsGone],
  Sv: stackVeilStill,
  Sd: stackHeroStill,
  Sk: stackCardsUnclipped,
  Sp: stackNoPosters,
  Kx: edgeNoHighlight,
  Kg: edgeNoFace,
  K0: edgeNone,
  Lc: roomNotLive,
  Lr: roomNotMarked,
  Lp: roomPlainPresses,
  Lb: roomFromTheTop,
  Ls0: [...roomNotLive, ...roomNotMarked, ...roomPlainPresses, ...roomFromTheTop],
  Xc: compilerOn,
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
