import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors } from '@/src/theme/theme';

export function DiamondDivider() {
  return (
    <View style={st.ornRule}>
      <View style={st.ornLine} />
      <View style={st.ornDiamond} />
      <View style={st.ornLine} />
    </View>
  );
}

const st = StyleSheet.create({
  ornRule: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginVertical: 8, marginHorizontal: 24, opacity: 0.4,
  },
  ornLine: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.sepia },
  ornDiamond: {
    width: 5, height: 5, backgroundColor: colors.sepia,
    transform: [{ rotate: '45deg' }],
  },
});
