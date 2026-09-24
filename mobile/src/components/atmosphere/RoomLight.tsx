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
import { memo, useId, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { LinearGradient as Fade } from 'expo-linear-gradient';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import {
  Canvas, Group, LinearGradient as SkLinear, Mask, RadialGradient as SkRadial, Rect as SkRect, vec,
} from '@shopify/react-native-skia';

import { lightGeometry, type Room } from '@/src/theme/light';
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

export const RoomLight = memo(function RoomLight({ room, hem, art }: LightProps) {
  const { width: W, height: H } = useWindowDimensions();
  // Scoped ids: two screens stacked on the navigator each hold a RoomLight.
  const id = useId().replace(/[^A-Za-z0-9]/g, '');
  const g = lightGeometry(room, W, H, hem);
  const colour = `rgb(${g.pool.rgb.join(',')})`;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" {...UNSPOKEN} testID="room-light">
      <Svg width={W} height={H} style={StyleSheet.absoluteFill}>
        <Defs>
          <RadialGradient id={`pool${id}`} gradientUnits="userSpaceOnUse" cx={g.pool.cx} cy={g.pool.cy} rx={g.pool.rx} ry={g.pool.ry}>
            {g.pool.stops.map(([at, a]) => (
              <Stop key={at} offset={at} stopColor={colour} stopOpacity={a} />
            ))}
          </RadialGradient>
          <LinearGradient id={`floor${id}`} gradientUnits="userSpaceOnUse" x1={0} y1={0} x2={0} y2={g.floor.height}>
            {g.floor.stops.map(([at, a]) => (
              <Stop key={at} offset={at} stopColor="#000" stopOpacity={a} />
            ))}
          </LinearGradient>
          <RadialGradient id={`corners${id}`} gradientUnits="userSpaceOnUse" cx={g.corners.cx} cy={g.corners.cy} rx={g.corners.rx} ry={g.corners.ry}>
            {g.corners.stops.map(([at, a]) => (
              <Stop key={at} offset={at} stopColor="#000" stopOpacity={a} />
            ))}
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={W} height={H} fill={`url(#pool${id})`} />
        <Rect x={0} y={0} width={W} height={H} fill={`url(#floor${id})`} />
        <Rect x={0} y={0} width={W} height={H} fill={`url(#corners${id})`} />
      </Svg>
      {art ? <RoomBloom uri={art} width={g.bloom.width} height={g.bloom.height} left={g.bloom.left} /> : null}
    </View>
  );
});

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
  const { width: W, height: H } = useWindowDimensions();
  const g = lightGeometry(room, W, H, hem);
  const image = useSharedImage(art);
  const opacity = useBloomOpacity(image);
  const still = useDerivedValue(() => [{ translateY: lifted ? lifted.value : 0 }]);
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
  const recipe = JSON.stringify({ room, hem, art: art ?? null, stops, W, H });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="room-veil-light" nativeID={recipe}>
      <Canvas style={{ position: 'absolute', top: 0, left: 0, width: W, height: hem }}>
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
