import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';
import type { LucideIcon } from 'lucide-react-native';



export const SectionCard = React.memo(({ children, danger }: { children: React.ReactNode; danger?: boolean }) => (
  <View style={[st.sectionCard, danger && st.sectionCardDanger]}>
    <LinearGradient
      colors={danger ? ['transparent', colors.bloodReel, 'transparent'] : ['transparent', colors.sepiaBorder, 'transparent']}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
      style={st.sectionTopLine}
    />
    <LinearGradient
      colors={[colors.sepiaFaint, 'transparent']}
      style={StyleSheet.absoluteFillObject}
    />
    {children}
  </View>
));
SectionCard.displayName = 'SectionCard';

export const SectionHead = React.memo(({ icon: Icon, label, danger }: { icon: LucideIcon; label: string; danger?: boolean }) => (
  <View style={st.sectionHeaderWrap}>
    <View style={st.sectionHeaderRow}>
      <Icon size={14} color={danger ? colors.bloodReel : colors.sepia} style={st.sectionHeaderIcon} />
      <Text style={[st.sectionHeaderText, danger && st.sectionHeaderTextDanger]}>{label}</Text>
    </View>
  </View>
));
SectionHead.displayName = 'SectionHead';

const st = StyleSheet.create({

  sectionCard: { marginHorizontal: 16, marginBottom: 16, padding: 20, backgroundColor: 'rgba(18,14,9,0.85)', borderWidth: 1, borderColor: colors.sepiaFaint, borderRadius: 4, overflow: 'hidden' },
  sectionCardDanger: { borderColor: colors.bloodFaint },
  sectionTopLine: { position: 'absolute', top: 0, left: 0, right: 0, height: 1 },
  sectionHeaderWrap: { marginBottom: 18, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: colors.sepiaFaint },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionHeaderIcon: { opacity: 0.7 },
  sectionHeaderText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.5, color: colors.sepia },
  sectionHeaderTextDanger: { color: colors.bloodReel },
});

