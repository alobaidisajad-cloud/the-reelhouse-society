/**
 * GeneralAdmission — the free seat, stated honestly.
 *
 * Not a ticket: nothing is chosen or bought here. A plain slip listing what
 * every member has, so that the paid tickets' "Everything free, and —" means
 * something a member has just read. The lines are the free promises that
 * `FREE_PROMISES` guards — no table they rest on may ever carry a tier gate.
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { privilegesOf, rankById } from '@/src/constants/membership';

export const GeneralAdmission = memo(function GeneralAdmission({ yours }: { yours: boolean }) {
  const rank = rankById('cinephile');
  const lines = privilegesOf('cinephile');
  return (
    <View style={s.slip}>
      <View accessible accessibilityRole="header" accessibilityLabel={`General admission. ${rank.name}. Free. ${yours ? 'Your seat.' : ''}`}>
        <Text style={s.key} {...deckLabelProps} {...UNSPOKEN}>GENERAL ADMISSION</Text>
        <View style={s.row} {...UNSPOKEN}>
          <Text style={s.name} {...displayTextProps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{rank.name}</Text>
          <Text style={s.price} {...deckLabelProps}>{yours ? 'YOUR SEAT' : 'FREE'}</Text>
        </View>
      </View>
      <Text style={s.tag} {...scaledTextProps}>{rank.character}</Text>
      <View style={s.list}>
        {lines.map((p) => (
          <View key={p.id} style={s.line} accessible accessibilityLabel={`${p.name}. ${p.detail}`}>
            <View style={s.pip} />
            <Text style={s.lineText} {...scaledTextProps}>{p.name}</Text>
          </View>
        ))}
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  slip: {
    marginHorizontal: 16, marginTop: 20,
    borderWidth: 1, borderColor: colors.ash, backgroundColor: colors.surface,
    paddingHorizontal: 18, paddingVertical: 16,
  },
  key: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.fog, includeFontPadding: false },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginTop: 4 },
  name: { fontFamily: fonts.display, fontSize: 24, lineHeight: 30, color: colors.parchment, flexShrink: 1 },
  price: { fontFamily: fonts.sub, fontSize: 12, letterSpacing: 2, color: colors.bone, includeFontPadding: false },
  tag: { fontFamily: fonts.bodyItalic, fontSize: 14, lineHeight: 20, color: colors.bone, marginTop: 2 },
  list: { marginTop: 12, gap: 7 },
  line: { flexDirection: 'row', gap: 11, alignItems: 'flex-start' },
  pip: { width: 5, height: 5, marginTop: 6, marginLeft: 2, borderWidth: 1, borderColor: colors.fog, transform: [{ rotate: '45deg' }] },
  lineText: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.parchment },
});
