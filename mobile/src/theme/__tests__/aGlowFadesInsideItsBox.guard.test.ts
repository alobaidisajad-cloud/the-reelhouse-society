/**
 * aGlowFadesInsideItsBox.guard.test.ts — every radial glow the app builds has
 * faded to nothing wherever its box ends on the screen.
 *
 * A gradient is painted inside its view's box and nowhere else, and a parent
 * with `overflow: hidden` (a ScrollView always) cuts it again at its own box.
 * Where such an edge lies inside the screen and the glow still has strength
 * there, the light stops in a straight line: the glow shows its rectangle. An
 * edge on the screen's own edge shows nothing, since nothing lies past it.
 *
 * So each builder (light.ts, CinematicOverlays.tsx, AuthChrome.tsx) is read
 * back through React Native's own parser, at the sizes its users give it, in
 * the box each user lays it in, and its alpha found along every edge that can
 * show, the way both phones resolve it (RadialGradient.kt, RCTRadialGradient.mm):
 * radii and centre as fractions of the box's width and height, the ellipse a
 * circle of its x radius scaled to its y radius, the last stop's colour past it.
 *
 * Each user's box is read where it can be (the styles it imports) and spelled
 * where it cannot (a route's own sheet), each anchored to its source.
 */
import { readCode } from '@/test-utils/readCode';
import { LAMPS, lightGeometry, roomLightImage, spotlightImage, type Room } from '@/src/theme/light';
import { VIGNETTE_IMAGE } from '@/src/components/CinematicOverlays';
import { candlelightImage } from '@/src/components/auth/AuthChrome';
import { s as profile } from '@/src/components/profile/profileStyles';

type LP = number | string | undefined;
type Layer = {
  type: string;
  shape?: string;
  size?: { x: LP; y: LP } | string;
  position?: { top?: LP; left?: LP; bottom?: LP; right?: LP };
  colorStops: { color: number; position: LP }[];
};
const processBackgroundImage: (css: string) => unknown =
  require('react-native/Libraries/StyleSheet/processBackgroundImage').default;
const read = (css: string) => processBackgroundImage(css) as Layer[];

/** A length or a percentage, resolved against a box `of` points. */
const len = (v: LP, of: number) => (typeof v === 'string' && v.endsWith('%') ? (parseFloat(v) / 100) * of : Number(v));

/** The alpha a radial layer paints at (x, y) of a box w × h, 0 to 1. */
function alphaAt(l: Layer, w: number, h: number, x: number, y: number): number {
  const p = l.position ?? {};
  const cx = p.left != null ? len(p.left, w) : p.right != null ? w - len(p.right, w) : w / 2;
  const cy = p.top != null ? len(p.top, h) : p.bottom != null ? h - len(p.bottom, h) : h / 2;
  if (!l.size || typeof l.size === 'string') throw new Error('a glow sized by keyword is not read here');
  const rx = len(l.size.x, w);
  const ry = len(l.size.y, h);
  const radii = l.shape === 'circle' ? [Math.max(rx, ry), Math.max(rx, ry)] : [rx, ry];
  const t = Math.hypot((x - cx) / radii[0], (y - cy) / radii[1]);
  const line = Math.max(...radii);
  const stops = l.colorStops.map((c) => ({
    at: typeof c.position === 'string' && c.position.endsWith('%') ? parseFloat(c.position) / 100 : Number(c.position) / line,
    a: ((c.color >>> 24) & 255) / 255,
  }));
  if (t <= stops[0].at) return stops[0].a;
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i].at) {
      const [s0, s1] = [stops[i - 1], stops[i]];
      return s0.a + ((s1.a - s0.a) * (t - s0.at)) / (s1.at - s0.at);
    }
  }
  return stops[stops.length - 1].a;
}

/** Half of one step of an 8-bit colour: less than this, the phone draws nothing. */
const NOTHING = 0.5 / 255;

type Rect = { x: number; y: number; w: number; h: number };
interface Use {
  name: string;
  css: string;
  /** The glow's box, in screen points. */
  box: Rect;
  /** Each parent that cuts it (overflow hidden, a ScrollView), in screen points. */
  clips: Rect[];
  screen: { w: number; h: number };
}

/** Every point on an edge that can show where a radial layer of the glow still has strength. */
function lit(u: Use): string[] {
  const v = [u.box, ...u.clips].reduce((a, b) => {
    const x = Math.max(a.x, b.x);
    const y = Math.max(a.y, b.y);
    return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
  });
  if (v.w <= 0 || v.h <= 0) return [];
  const across = (y: number) => Array.from({ length: 65 }, (_, i) => [Math.max(v.x, 0) + (i / 64) * (Math.min(v.x + v.w, u.screen.w) - Math.max(v.x, 0)), y]);
  const down = (x: number) => Array.from({ length: 65 }, (_, i) => [x, Math.max(v.y, 0) + (i / 64) * (Math.min(v.y + v.h, u.screen.h) - Math.max(v.y, 0))]);
  const edges: [string, number[][]][] = [];
  if (v.y > 0) edges.push(['top', across(v.y)]);
  if (v.y + v.h < u.screen.h) edges.push(['bottom', across(v.y + v.h)]);
  if (v.x > 0) edges.push(['left', down(v.x)]);
  if (v.x + v.w < u.screen.w) edges.push(['right', down(v.x + v.w)]);
  const layers = read(u.css).filter((l) => l.type === 'radial-gradient');
  if (!layers.length) throw new Error(`${u.name}: no radial layer read`);
  const out: string[] = [];
  for (const [side, points] of edges) {
    const worst = Math.max(...points.flatMap(([x, y]) => layers.map((l) => alphaAt(l, u.box.w, u.box.h, x - u.box.x, y - u.box.y))));
    if (worst >= NOTHING) out.push(`${u.name}: ${side} edge at alpha ${worst.toFixed(3)}`);
  }
  return out;
}

const SCREENS: [number, number][] = [[320, 568], [375, 667], [393, 852], [430, 932], [412, 915], [800, 1280]];
const ROOMS = Object.keys(LAMPS) as Room[];
const full = (W: number, H: number): Rect => ({ x: 0, y: 0, w: W, h: H });

/** THE ROOM'S LIGHT: a box the size of the screen, at the screen's root (RoomLight). */
const roomLight: Use[] = SCREENS.flatMap(([W, H]) => ROOMS.flatMap((room) => [undefined, 0.25 * H, 0.5 * H, 0.75 * H].map((hem) => ({
  name: `room light, ${room}, ${W}×${H}, hem ${hem ?? 'none'}`,
  css: roomLightImage(lightGeometry(room, W, H, hem), H),
  box: full(W, H), clips: [], screen: { w: W, h: H },
}))));

/** THE VIGNETTE: the Lobby's welcome root, full screen (the tab bar floats over it). */
const vignette: Use[] = SCREENS.map(([W, H]) => ({
  name: `vignette, ${W}×${H}`, css: VIGNETTE_IMAGE, box: full(W, H), clips: [], screen: { w: W, h: H },
}));

const MEMBER_FILE = 'app/user/[username].tsx';
const wrap = readCode(MEMBER_FILE).match(/wrap: \{ position: 'absolute', top: (-?\d+), left: 0, right: 0, height: (\d+)/);
const spotTop = Number(wrap?.[1]);
const spotH = Number(wrap?.[2]);
const plateLeast = Number(profile.identRow.paddingTop) + Number(profile.plate.height) + Number(profile.statsBox.marginTop) + 2 +
  Number(profile.statCell.minHeight) + Number(profile.actsRow.paddingTop) + Number(profile.act.minHeight) + Number(profile.actsRow.paddingBottom);
/**
 * A MEMBER'S SPOTLIGHT: `spotStyles.wrap` in the member's file, inside the
 * plate (`headerWrap`, overflow hidden), which is the first thing in the page's
 * scroll and so begins at the top of the screen. The plate is at least as tall
 * as the parts it always holds: the print, the figures, the acts.
 */
const spotlight: Use[] = SCREENS.flatMap(([W, H]) => [0.12, 0.18, 0.2, 0.26].flatMap((opacity) =>
  Array.from({ length: 61 }, (_, i) => plateLeast + i * 10).map((plateH) => ({
    name: `spotlight ${opacity}, ${W}×${H}, plate ${plateH}`,
    css: spotlightImage('#B8891A', opacity),
    box: { x: 0, y: spotTop, w: W, h: spotH },
    clips: [{ x: 0, y: 0, w: W, h: plateH }],
    screen: { w: W, h: H },
  }))));

/** A halo of `halo` points centred on a mark of `mark` points whose top-left is (x, y). */
const haloBox = (mark: number, halo: number, x: number, y: number): Rect =>
  ({ x: x + (mark - halo) / 2, y: y + (mark - halo) / 2, w: halo, h: halo });

const WELCOME = 'app/(tabs)/index.tsx';
const welcomeTop = Number(readCode(WELCOME).match(/welcomeTopHalf: \{[^}]*paddingTop: (\d+)/)?.[1]);
const sealHalo = (size: number) => Math.round(size * 2.3);
/**
 * THE CANDLELIGHT HALO, where each user lays it.
 *   The welcome page's seal: its ScrollView begins at the top of the screen,
 *   and the seal hangs below the bar (here, the status bar alone: nearer the top).
 *   The sign-in seal: its ScrollView begins at the top of the screen.
 *   The founding certificate's seal and the two unframed icons: no parent cuts them.
 */
const halos: Use[] = SCREENS.flatMap(([W, H]) => {
  const screen = { w: W, h: H };
  const seal = Math.min(104, Math.round(H * 0.15));
  const statusBar = 44;
  return [
    { name: `welcome seal ${seal}, ${W}×${H}`, size: sealHalo(seal), box: haloBox(seal, sealHalo(seal), (W - seal) / 2, statusBar + welcomeTop), clips: [full(W, H)] },
    { name: `sign-in seal, ${W}×${H}`, size: sealHalo(92), box: haloBox(92, sealHalo(92), (W - 92) / 2, 200), clips: [full(W, H)] },
    { name: `certificate seal, ${W}×${H}`, size: sealHalo(64), box: haloBox(64, sealHalo(64), (W - 64) / 2, 300), clips: [] },
    { name: `inbox icon, ${W}×${H}`, size: 130, box: haloBox(72, 130, (W - 72) / 2, 300), clips: [] },
    { name: `key icon, ${W}×${H}`, size: 104, box: haloBox(57, 104, (W - 57) / 2, 300), clips: [] },
  ].flatMap((u) => [0.38, 0.5].map((intensity) => ({ ...u, name: `${u.name}, ${intensity}`, css: candlelightImage(u.size, intensity), screen })));
});

/** Glows cut where they show today, each with why it is kept. */
const KEPT: Record<string, string> = {};
const keptAs = (line: string) => Object.keys(KEPT).find((k) => line.startsWith(k));

it('reads each user’s box from its source', () => {
  expect([spotTop, spotH]).toEqual([-30, 340]);
  expect(plateLeast).toBeGreaterThan(250);
  expect(profile.headerWrap.overflow).toBe('hidden');
  // The file's scroll starts at the top of the screen: its content has a foot and no top padding.
  expect(readCode('app/user/[username].tsx')).toMatch(/<CinematicScrollView contentContainerStyle=\{\{ paddingBottom: endPad \}\}/);
  expect(welcomeTop).toBeGreaterThanOrEqual(0);
  // The welcome's scroll is the page's whole height: its holder has no top padding, its content has the bar's.
  const welcome = readCode(WELCOME).split('if (!isAuthenticated) {')[1]?.split('</FrozenTab>')[0] ?? '';
  expect(welcome).toMatch(/<FrozenTab>\s*<View style=\{s\.container\}>/);
  expect(welcome).toMatch(/contentContainerStyle=\{\[s\.welcomeScrollContent, \{ paddingTop: topPad,/);
  expect(readCode(WELCOME)).toMatch(/<SocietySeal size=\{Math\.min\(104, Math\.round\(windowHeight \* 0\.15\)\)\} \/>/);
  expect(readCode('src/components/auth/SocietySeal.tsx')).toMatch(/const haloSize = Math\.round\(size \* 2\.3\);/);
});

it('lets no radial glow show its box anywhere on the screen', () => {
  const uses = [...roomLight, ...vignette, ...spotlight, ...halos];
  expect(uses.length).toBeGreaterThan(1000);
  const shown = uses.flatMap(lit);
  expect(shown.filter((line) => !keptAs(line))).toEqual([]);
  // A kept glow that no longer shows is no longer kept.
  expect(Object.keys(KEPT).filter((k) => !shown.some((line) => line.startsWith(k)))).toEqual([]);
});

it('can fail: a planted glow wider than its box, inside the screen, shows its edge', () => {
  const planted = 'radial-gradient(ellipse 60% 60% at 50% 50%, rgba(255,226,176,0.5) 0%, rgba(255,226,176,0) 100%)';
  const inside: Use = { name: 'planted', css: planted, box: { x: 40, y: 200, w: 200, h: 120 }, clips: [], screen: { w: 393, h: 852 } };
  expect(lit(inside).map((l) => l.split(' at ')[0])).toEqual(['planted: top edge', 'planted: bottom edge', 'planted: left edge', 'planted: right edge']);
  // The same glow on a box the size of the screen shows nothing: no edge lies inside it.
  expect(lit({ ...inside, box: full(393, 852) })).toEqual([]);
  // And a parent that cuts it shows its own edge.
  const cut = lit({ ...inside, css: candlelightImage(200, 0.5), box: { x: 40, y: 200, w: 200, h: 200 }, clips: [{ x: 0, y: 260, w: 393, h: 600 }] });
  expect(cut.map((l) => l.split(' at ')[0])).toEqual(['planted: top edge']);
});

it('reads a glow the way the phone does: full at its heart, nothing at its last stop', () => {
  const [halo] = read(candlelightImage(200, 0.5));
  expect(alphaAt(halo, 200, 200, 100, 100)).toBeCloseTo(0.5, 2);
  expect(alphaAt(halo, 200, 200, 100, 0)).toBe(0);
  const [spot] = read(spotlightImage('#B8891A', 0.2));
  // 71.92% across, from the middle: its left and right edges keep about 30% of its strength.
  expect(alphaAt(spot, 393, 340, 0, 0) / 0.2).toBeCloseTo(0.3, 1);
});
