import { View, Text } from 'react-native';
import Svg, { Path, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { colors } from '@/src/theme/theme';
import { st } from './styles';

export function OrnamentalDivider() {
  return (
    <View style={st.dividerWrap}>
      <Svg width="100%" height="12" viewBox="0 0 300 12" preserveAspectRatio="none">
        <Defs>
          <SvgLinearGradient id="g" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0" stopColor={colors.sepia} stopOpacity="0" />
            <Stop offset="0.3" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="0.5" stopColor={colors.sepia} stopOpacity="0.8" />
            <Stop offset="0.7" stopColor={colors.sepia} stopOpacity="0.4" />
            <Stop offset="1" stopColor={colors.sepia} stopOpacity="0" />
          </SvgLinearGradient>
        </Defs>
        <Rect x="0" y="5.5" width="300" height="0.5" fill="url(#g)" />
        <Path d="M150 0 L156 6 L150 12 L144 6 Z" fill={colors.sepia} opacity="0.8" />
        <Path d="M135 4 L139 6 L135 8 L131 6 Z" fill={colors.sepia} opacity="0.4" />
        <Path d="M165 4 L169 6 L165 8 L161 6 Z" fill={colors.sepia} opacity="0.4" />
      </Svg>
    </View>
  );
}

export function SectionHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={st.sectionHeaderBlock}>
      <Text style={st.shTitle}>{title}</Text>
      <Text style={st.shSub}>{sub}</Text>
    </View>
  );
}
