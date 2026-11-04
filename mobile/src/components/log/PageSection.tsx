import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps } from '@/src/constants/textScaling';
import { PAGE } from '@/src/components/log/pageMetrics';

/** One section of the opened log: its name in the typewriter's caps, a hairline to the margin, then what it holds. */
export function PageSection({ title, children, onLayout }: {
  title: string;
  children?: React.ReactNode;
  onLayout?: (y: number) => void;
}) {
  return (
    <View style={st.section} onLayout={onLayout ? (e) => onLayout(e.nativeEvent.layout.y) : undefined}>
      <View style={st.head}>
        <Text style={st.title} {...scaledTextProps} accessibilityRole="header">{title}</Text>
        <View style={st.rule} />
      </View>
      {children}
    </View>
  );
}

const st = StyleSheet.create({
  section: { marginTop: PAGE.section },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.bone, includeFontPadding: false },
  rule: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(232,223,208,0.1)' },
});
