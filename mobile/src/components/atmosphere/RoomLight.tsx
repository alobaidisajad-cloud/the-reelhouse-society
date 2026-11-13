/**
 * RoomLight — the light in the room, painted once, under everything.
 * ──────────────────────────────────────────────────────────────────────────
 * Mount it as the FIRST child of a screen's root view (the one painted in the
 * house colour). It fills the screen, draws nothing a member can touch or
 * hear, and stays put while the page scrolls over it — a lamp hangs from the
 * ceiling, it does not travel down the page.
 *
 * What it paints, bottom to top, exactly as `theme/light.ts` describes:
 *   the room's lamp (a pool of warm light) · the floor going dark · the
 *   corners falling away · and, where a film hangs at the top of the screen,
 *   that film's own colour blooming softly onto the page beneath it.
 *
 * Everything above it must let it through: a section painted in the house
 * colour between this and the page would hide the light behind it and draw a
 * seam where it ends. Opaque SURFACES (cards, bars, sheets) are fine — they
 * are meant to sit on the light, not show it.
 *
 * A photograph at the top of the screen is the one exception, and it has its
 * own answer: `RoomVeil`, below.
 */
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient as Fade } from 'expo-linear-gradient';
import { useAnimatedReaction, useSharedValue, type SharedValue } from 'react-native-reanimated';
import {
  Canvas, Group, LinearGradient as SkLinear, Mask, RadialGradient as SkRadial, Rect as SkRect, vec,
} from '@shopify/react-native-skia';

import { lightGeometry, roomLightImage, type Room } from '@/src/theme/light';
import { useScreenSeen } from '@/src/hooks/useScreenSeen';
import { colors } from '@/src/theme/theme';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { BloomLayer, RoomBloom, useBloomOpacity } from './RoomBloom';
import { useSharedImage } from './useSharedImage';

/** Where on a veil (0 = its top, 1 = its hem) and how much of the house it paints there. */
export type VeilStops = readonly (readonly [at: number, alpha: number])[];

interface LightProps {
  room: Room;
  /**
   * Where a photograph hanging at the top of the screen ENDS, in points from
   * the top, at rest. The pool hangs from there instead of the crown — the
   * photograph lights its own zone — so their join is never a band.
   */
  hem?: number;
  /** That photograph, to bloom from. Only a hero at the top is a light source. */
  art?: string | null;
}

/**
 * How far the window runs past the page's column on each side: 0 on a phone, where the column is
 * the window; on an iPad, an unfolded phone or a Split View, half of what the column leaves.
 */
export function useWideInset(): { window: number; inset: number } {
  const window = useWindowDimensions().width;
  const column = useColumnWidth();
  return { window, inset: Math.max(0, (window - column) / 2) };
}

/** Where a screen in front hands its light to the window around its column (WideRoomHost). */
const WideHost = createContext<((key: object, light: LightProps | null) => void) | null>(null);

/**
 * THE ROOM ACROSS A WIDE WINDOW. Each page stands in the reading column; on a window wider than the
 * column its light stopped at the column's edges, a lit strip on a dark window. So the light is
 * drawn at the WINDOW's width: the screen's own RoomLight inside the column, laid from the window's
 * left edge (clipped by the column), and this host behind the column, the same light from the same
 * geometry over the whole window. The two meet pixel for pixel at the column's edges. Each route's
 * layout holds one (toastScreenLayout); a host inside a host leaves the window to the outer one.
 */
export function WideRoomHost({ children }: { children: ReactNode }) {
  const outer = useContext(WideHost);
  const [lit, setLit] = useState<{ key: object; light: LightProps } | null>(null);
  const publish = useCallback((key: object, light: LightProps | null) => {
    setLit((now) => (light ? { key, light } : now?.key === key ? null : now));
  }, []);
  const { window, inset } = useWideInset();
  if (outer) return <>{children}</>;
  return (
    <WideHost.Provider value={publish}>
      <View style={wideStyles.host}>
        {inset > 0 && lit ? <LightLayer {...lit.light} width={window} left={0} /> : null}
        {children}
      </View>
    </WideHost.Provider>
  );
}

/** A screen's light handed to its host while the screen is in front and the window is wide. */
function usePublishedLight({ room, hem, art }: LightProps, inset: number) {
  const publish = useContext(WideHost);
  const seen = useScreenSeen();
  // This screen's own token: the host forgets the light only if it is still this screen's.
  const [key] = useState(() => ({}));
  useEffect(() => {
    if (!publish || !seen || inset <= 0) return undefined;
    publish(key, { room, hem, art });
    return () => publish(key, null);
  }, [publish, seen, inset, key, room, hem, art]);
}

/** The light itself, `width` wide from `left`: the pool, the floor, the corners and any bloom. */
function LightLayer({ room, hem, art, width, left }: LightProps & { width: number; left: number }) {
  const { height: H } = useWindowDimensions();
  const g = lightGeometry(room, width, H, hem);
  // Kept by Android as a texture while its screen is in front: the light is still, the list
  // over it is not, and redrawn under every scrolled frame it cost the Reel a third of its
  // middle frame time (speed lab 39901452779, Rh: p50 −550 ms, p90 −1050 ms). Let go behind,
  // so a deep stack holds one screen's texture, not one a screen.
  const seen = useScreenSeen();
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" {...UNSPOKEN} testID="room-light" renderToHardwareTextureAndroid={seen}>
      {/* The pool, the floor and the corners: one view, one native background,
          no bitmap (see roomLightImage), in the same box the light always had. */}
      <View style={{ position: 'absolute', top: 0, left, width, height: H, experimental_backgroundImage: roomLightImage(g, H) }} />
      {art ? <RoomBloom uri={art} width={g.bloom.width} height={g.bloom.height} left={left + g.bloom.left} /> : null}
    </View>
  );
}

export const RoomLight = memo(function RoomLight(light: LightProps) {
  const { window, inset } = useWideInset();
  usePublishedLight(light, inset);
  // Laid from the window's left edge, the window wide: on a phone that is the column itself; on a
  // wide window the column clips it, and it meets the host's light behind the column.
  return <LightLayer {...light} width={window} left={inset ? -inset : 0} />;
});

const wideStyles = StyleSheet.create({ host: { flex: 1 } });

/**
 * RoomVeil — how a photograph at the top of the screen fades into the room.
 * ──────────────────────────────────────────────────────────────────────────
 * A hero photograph fades out down its height under a veil of the house
 * colour, ending solid at its hem so the picture has no edge. But the room's
 * light is brightest right there, where the pool hangs from the hem — so a
 * veil of plain house colour ends in a hard line: dark above, lit below.
 * Measured on the film page, 13 to 20 across two pixels, the width of the
 * screen.
 *
 * So the veil paints the LIT room, not the bare house. Wherever it lays down
 * the house colour at some strength, it lays the room's light over it at the
 * same strength. At the hem, where the veil is solid, what it paints is the
 * room exactly, pixel for pixel, and the photograph dissolves into the light
 * with no line anywhere across the screen.
 *
 * Mount it where the plain veil was — the last layer over the photograph, in
 * the same box, so it moves and fades with it — and give it the same room,
 * hem and art as the screen's RoomLight. A photograph that moves as the page
 * scrolls passes how far it has been `lifted`: the veil moves with it, but
 * the light it carries is the ROOM's, and holds still on the screen while the
 * page slides under it, exactly as the room's own light does.
 */
export const RoomVeil = memo(function RoomVeil({ stops, lifted, ...light }: LightProps & {
  hem: number;
  stops: VeilStops;
  /**
   * How far the photograph has been carried UP the screen since rest: the
   * page's scroll for one that scrolls with the page, a drift negated for one
   * that drifts. The light it carries moves back by as much, and holds still.
   */
  lifted?: SharedValue<number>;
}) {
  const fade = useMemo(() => ({
    colors: stops.map(([, a]) => houseAt(a)) as unknown as readonly [string, string, ...string[]],
    locations: stops.map(([at]) => at) as unknown as readonly [number, number, ...number[]],
  }), [stops]);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" {...UNSPOKEN}>
      <Fade colors={fade.colors} locations={fade.locations} style={StyleSheet.absoluteFill} />
      <VeilLight {...light} stops={stops} lifted={lifted} />
    </View>
  );
});

/**
 * How far the veil's light moves back for a photograph lifted `lifted`: as far, until the hem
 * has risen past the top of any screen it could start on (it starts no lower than a screen
 * down), and no further. Past that nothing of it shows, and an unchanged lift draws nothing.
 */
export function heldLift(lifted: number, hem: number, screenHeight: number): number {
  'worklet';
  return Math.min(lifted, hem + screenHeight);
}

/**
 * The room's light, at the veil's strength, down to the hem and no further.
 * Drawn in Skia so the light can hold still on the UI thread while the veil
 * scrolls — a transform fed straight from the scroll position, never a render.
 *
 * Its wrapper carries the recipe for the design renderer (which cannot run
 * Skia): `testID="room-veil-light"`, and in `nativeID` the room, the hem, the
 * stops and the art — from which it draws the same light, from the same
 * `lightGeometry`.
 */
function VeilLight({ room, hem, art, stops, lifted }: LightProps & { hem: number; stops: VeilStops; lifted?: SharedValue<number> }) {
  const { height: H } = useWindowDimensions();
  // The room's light at the window's width, laid from its left edge, as RoomLight lays it: on a
  // wide window the veil's light meets the light around the column, pixel for pixel.
  const { window: W, inset } = useWideInset();
  const L = inset ? -inset : 0;
  const g = lightGeometry(room, W, H, hem);
  const image = useSharedImage(art);
  const opacity = useBloomOpacity(image);
  // Moved back only while any of it can show: once the hem has risen past the top of any screen
  // it could start on, the canvas is left alone, not redrawn on every frame of the scroll below.
  const still = useSharedValue([{ translateY: 0 }]);
  useAnimatedReaction(
    () => (lifted ? heldLift(lifted.value, hem, H) : 0),
    (now, before) => { if (now !== before) still.value = [{ translateY: now }]; },
  );
  const ramp = useMemo(() => ({
    colors: stops.map(([, a]) => `rgba(0,0,0,${a})`),
    positions: stops.map(([at]) => at),
  }), [stops]);
  const pool = useMemo(() => ({
    colors: g.pool.stops.map(([, a]) => `rgba(${g.pool.rgb.join(',')},${a})`),
    positions: g.pool.stops.map(([at]) => at),
  }), [g.pool.stops, g.pool.rgb]);
  const black = (s: readonly (readonly [number, number])[]) => ({
    colors: s.map(([, a]) => `rgba(0,0,0,${a})`),
    positions: s.map(([at]) => at),
  });
  const floor = black(g.floor.stops);
  const corners = black(g.corners.stops);
  const recipe = JSON.stringify({ room, hem, art: art ?? null, stops, W, H, L });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="room-veil-light" nativeID={recipe}>
      <Canvas style={{ position: 'absolute', top: 0, left: L, width: W, height: hem }}>
        {/* Nothing below the hem: the ramp's rect ends there, and outside it
            the mask is empty. */}
        <Mask
          mode="alpha"
          mask={(
            <SkRect x={0} y={0} width={W} height={hem}>
              <SkLinear start={vec(0, 0)} end={vec(0, hem)} colors={ramp.colors} positions={ramp.positions} />
            </SkRect>
          )}
        >
          <Group transform={still}>
            <SkRect x={0} y={0} width={W} height={H}>
              {/* An ellipse is a circle of radius rx, squashed about its centre. */}
              <SkRadial
                c={vec(g.pool.cx, g.pool.cy)}
                r={g.pool.rx}
                colors={pool.colors}
                positions={pool.positions}
                origin={vec(g.pool.cx, g.pool.cy)}
                transform={[{ scaleY: g.pool.ry / g.pool.rx }]}
              />
            </SkRect>
            <SkRect x={0} y={0} width={W} height={H}>
              <SkLinear start={vec(0, 0)} end={vec(0, g.floor.height)} colors={floor.colors} positions={floor.positions} />
            </SkRect>
            <SkRect x={0} y={0} width={W} height={H}>
              <SkRadial
                c={vec(g.corners.cx, g.corners.cy)}
                r={g.corners.rx}
                colors={corners.colors}
                positions={corners.positions}
                origin={vec(g.corners.cx, g.corners.cy)}
                transform={[{ scaleY: g.corners.ry / g.corners.rx }]}
              />
            </SkRect>
            {image ? (
              <Group transform={[{ translateX: g.bloom.left }]}>
                <BloomLayer image={image} width={g.bloom.width} height={g.bloom.height} opacity={opacity} />
              </Group>
            ) : null}
          </Group>
        </Mask>
      </Canvas>
    </View>
  );
}

/** The house colour at a given strength. */
function houseAt(alpha: number): string {
  const n = parseInt(colors.ink.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
