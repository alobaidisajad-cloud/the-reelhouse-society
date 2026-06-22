import { Image, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';

const TICK = 16;
const INSET = 10;
const THICK = 1.5;

/** Inset sepia frame + four corner ticks — the "mounted print" border, identical to web. */
export function DossierBorder({ width, height }: { width: number; height: number }) {
  const right = width - INSET;
  const bottom = height - INSET;
  const corners = [
    { top: INSET, left: INSET, hLeft: true, vTop: true },
    { top: INSET, left: right - TICK, hLeft: false, vTop: true },
    { top: bottom - TICK, left: INSET, hLeft: true, vTop: false },
    { top: bottom - TICK, left: right - TICK, hLeft: false, vTop: false },
  ];
  return (
    <>
      <View pointerEvents="none" style={{ position: 'absolute', top: INSET, left: INSET, right: INSET, bottom: INSET, borderWidth: 1, borderColor: colors.sepiaBorder }} />
      {corners.map((c, i) => (
        <View key={i} pointerEvents="none" style={{ position: 'absolute', top: c.top, left: c.left, width: TICK, height: TICK }}>
          <View style={{ position: 'absolute', top: 0, left: c.hLeft ? 0 : undefined, right: c.hLeft ? undefined : 0, width: TICK, height: THICK, backgroundColor: colors.sepiaBorderStrong }} />
          <View style={{ position: 'absolute', left: c.hLeft ? 0 : undefined, right: c.hLeft ? undefined : 0, top: c.vTop ? 0 : undefined, bottom: c.vTop ? undefined : 0, width: THICK, height: TICK, backgroundColor: colors.sepiaBorderStrong }} />
        </View>
      ))}
    </>
  );
}

/** Brand lockup footer — same seal mark + wordmark used in the navbar/login/lobby screens. */
export function DossierFooter() {
  return (
    <View pointerEvents="none" style={{ position: 'absolute', bottom: 10, left: 0, right: 0, alignItems: 'center' }}>
      <LinearGradient
        colors={['transparent', colors.sepiaBorderStrong, 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: 90, height: 1, marginBottom: 6 }}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Image source={require('../../../assets/images/reelhouse-logo.png')} style={{ width: 14, height: 14, opacity: 0.85 }} resizeMode="contain" />
        <Text style={{ fontFamily: fonts.ui, fontSize: 8, letterSpacing: 3, color: colors.sepiaBorderStrong }}>THE REELHOUSE SOCIETY</Text>
      </View>
    </View>
  );
}

export const DOSSIER_CARD_WIDTH = 360;
export const DOSSIER_CARD_HEIGHT = 640;
