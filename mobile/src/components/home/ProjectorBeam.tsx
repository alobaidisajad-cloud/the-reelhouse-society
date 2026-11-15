/**
 * ProjectorBeam — the front door's projector sweep; culled once scrolled a screen down.
 */
import { memo, useCallback } from 'react';
import { Canvas, Rect, Shader, Skia } from '@shopify/react-native-skia';
import { useColumnWidth, useWideInset } from '@/src/components/layout/navMetrics';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  SharedValue,
  useSharedValue, useAnimatedStyle, useDerivedValue, withRepeat, withSequence, withTiming,
  Easing, cancelAnimation
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';



export const ProjectorBeam = memo(function ProjectorBeam({ scrollY }: { scrollY: SharedValue<number> }) {
  const { height } = useWindowDimensions();
  const width = useColumnWidth();
  const wide = useWideInset().inset > 0;
  const beamSwing = useSharedValue(0.1);
  const flicker = useSharedValue(0.8);

  // Park the loops when the screen is blurred (invisible off-tab) and resume on
  // focus — stops burning the UI thread on background tabs. Pure, zero-visual.
  useFocusEffect(
    useCallback(() => {
      beamSwing.value = withRepeat(
        withSequence(
          withTiming(-0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) }),
          withTiming(0.1, { duration: 8000, easing: Easing.inOut(Easing.sin) })
        ), -1, true
      );
      // A calm 0.92–1.00 flicker: a wider swing strobes on a phone and reads as a glitch.
      flicker.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.95, { duration: 300 }),
          withTiming(0.98, { duration: 500 }),
          withTiming(0.92, { duration: 200 }),
          withTiming(0.97, { duration: 1600 }),
        ), -1, false
      );
      return () => {
        cancelAnimation(beamSwing);
        cancelAnimation(flicker);
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])
  );

  const style = useAnimatedStyle(() => {
    const isCulled = scrollY.value > height;
    if (isCulled) return { transform: [{ translateY: -3000 }], opacity: 0 };
    // The shaft is drawn already tilted (BeamShaft): only its flicker is the view's.
    if (wide) return { opacity: flicker.value };

    return {
      opacity: flicker.value,
      transform: [
        { perspective: 400 },
        { rotateX: '55deg' },
        { rotateZ: `${beamSwing.value * 15}deg` },
        { scaleY: 1.5 },
        { translateY: -100 }
      ],
    };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style, { alignItems: 'center', zIndex: 0 }]} pointerEvents="none">
      {wide ? <BeamShaft width={width} height={height} swing={beamSwing} /> : (
        <LinearGradient
          colors={['rgba(218,165,32,0.15)', 'rgba(184,137,26,0.06)', 'transparent']}
          locations={[0, 0.4, 0.9]}
          style={{ width: width * 1.5, height: height, borderTopLeftRadius: width, borderTopRightRadius: width }}
        />
      )}
    </Animated.View>
  );
});

/** The shaft's brightest gold, at its heart. */
export const SHAFT_PEAK = 0.17;

/**
 * The shaft, as the phone's beam is laid (a page and a half wide, a window tall, tilted back 55°
 * under a 400-point perspective, stretched 1.5 down and lifted 100), drawn flat: each pixel is
 * taken back through the tilt to the beam's own plane, and lit as that plane is lit. Tilted as a
 * view instead, iOS drew only the half of the plane before the page: the light stopped at the
 * window's middle in a straight line, at its brightest (ios-launch 43670385265, the photograph read
 * by ios-ipad-judge.mjs). The light is an ellipse on the plane, 26% of the beam wide and 48% of it
 * tall about a heart at 46% down, falling away cosine-squared to nothing; within the last 45% of
 * the page's half-width it falls away again, to nothing at the page's edge, where its glow had
 * stopped in two lines down the screen. Each pixel's gold moves by up to a level either way (two
 * grains summed, so every level is broken, not only those near a half), and no level stands long
 * enough to band. `size` is the page's width and the window's height, `swing` the sway in radians.
 */
export const SHAFT_SKSL = `
uniform float2 size;
uniform float swing;

const float D = 400.0;
const float SIN_TILT = 0.8191520;
const float COS_TILT = 0.5735764;
const float PEAK = ${SHAFT_PEAK.toFixed(2)};
const float QUARTER = 1.5707963;

float grain(float2 p) {
  return fract(sin(dot(p, float2(12.9898, 78.233))) * 43758.5453);
}

half4 main(float2 pos) {
  float2 s = pos - size * 0.5;
  float across = COS_TILT * D + s.y * SIN_TILT;
  if (across <= 0.0) { return half4(0.0); }
  float y = s.y * D / across;
  float k = D / (D - y * SIN_TILT);
  float2 p = float2(s.x / k, y);
  float c = cos(swing);
  float n = sin(swing);
  p = float2(c * p.x + n * p.y, c * p.y - n * p.x);
  p.y = p.y / 1.5 + 100.0;
  float2 beam = float2(size.x * 1.5, size.y);
  if (abs(p.x) > beam.x * 0.5 || abs(p.y) > beam.y * 0.5) { return half4(0.0); }
  float t = length((p - float2(0.0, beam.y * -0.04)) / float2(beam.x * 0.26, beam.y * 0.48));
  if (t >= 1.0) { return half4(0.0); }
  float l = cos(t * QUARTER);
  float u = abs(s.x) / (size.x * 0.5);
  float e = u <= 0.55 ? 1.0 : (u >= 1.0 ? 0.0 : cos((u - 0.55) / 0.45 * QUARTER));
  float a = PEAK * l * l * e * e;
  float3 gold = float3(218.0, 165.0, 32.0) / 255.0 * a;
  float d = (grain(pos) + grain(pos + float2(17.0, 31.0)) - 1.0) / 255.0 * smoothstep(0.0, 0.0008, a);
  return half4(half3(max(gold + d, float3(0.0))), half(a));
}
`;

const SHAFT = Skia.RuntimeEffect.Make(SHAFT_SKSL);

/** On a window wider than the page (an iPad), the beam is this shaft of light inside the page. */
function BeamShaft({ width, height, swing }: { width: number; height: number; swing: SharedValue<number> }) {
  // The sway, as the phone's beam turns: a tenth of the swing is 1.5°.
  const uniforms = useDerivedValue(() => ({ size: [width, height], swing: (swing.value * 15 * Math.PI) / 180 }));
  if (!SHAFT) return null;
  return (
    <Canvas testID="projector-shaft" style={{ width, height }}>
      <Rect x={0} y={0} width={width} height={height}>
        <Shader source={SHAFT} uniforms={uniforms} />
      </Rect>
    </Canvas>
  );
}
