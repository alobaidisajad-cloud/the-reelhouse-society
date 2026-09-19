/**
 * PrivilegeLedger — every privilege, in writing.
 *
 * The comparison a member cannot make from tickets that list only what each
 * rank ADDS: one row per privilege, one column per rank, a diamond where the
 * rank holds it. Drawn from the same PRIVILEGES the tickets are, so the two
 * cannot disagree; a rank holds a privilege exactly when it stands at or above
 * the privilege's rank (`rankIncludes`).
 *
 * Read aloud a row at a time — "The Vault: the Archivist and the Auteur." — not
 * cell by cell, which would be seventeen rows of "diamond, dash, diamond".
 */
import { memo } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { colors, fonts } from '@/src/theme/theme';
import { deckLabelProps, displayTextProps, scaledTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { LEDGER_GROUPS, PRIVILEGES, rankIncludes, type RankId } from '@/src/constants/membership';

const COLUMNS: { id: RankId; label: string; spoken: string; width: number }[] = [
  { id: 'cinephile', label: 'FREE', spoken: 'every member', width: 50 },
  { id: 'archivist', label: 'ARCHIVIST', spoken: 'the Archivist', width: 64 },
  { id: 'auteur', label: 'AUTEUR', spoken: 'the Auteur', width: 56 },
];

/** "every member" / "the Archivist and the Auteur" / "the Auteur". */
function holders(rank: RankId): string {
  if (rank === 'cinephile') return 'every member';
  const names = COLUMNS.filter((c) => c.id !== 'cinephile' && rankIncludes(c.id, rank)).map((c) => c.spoken);
  return names.join(' and ');
}

export const PrivilegeLedger = memo(function PrivilegeLedger() {
  return (
    <View style={s.wrap}>
      <View style={s.heading} accessible accessibilityRole="header" accessibilityLabel="The ledger. Every privilege, in writing. Nothing is sold here that the house does not do.">
        <View style={s.keyRow} {...UNSPOKEN}>
          <View style={s.keyRule} />
          <Text style={s.key} {...deckLabelProps}>THE LEDGER</Text>
          <View style={s.keyRule} />
        </View>
        <Text style={s.title} {...displayTextProps} {...UNSPOKEN}>Every Privilege,{'\n'}in Writing.</Text>
        <Text style={s.note} {...scaledTextProps} {...UNSPOKEN}>Nothing is sold here that the house does not do.</Text>
      </View>

      <View style={s.table}>
        <View style={s.headRow} {...UNSPOKEN}>
          <View style={s.cellName} />
          {COLUMNS.map((c) => (
            <View key={c.id} style={[s.cell, { width: c.width }]}>
              <Text style={[s.col, c.id === 'archivist' && s.colArchivist, c.id === 'auteur' && s.colAuteur]} {...deckLabelProps} maxFontSizeMultiplier={1.2}>{c.label}</Text>
            </View>
          ))}
        </View>

        {LEDGER_GROUPS.map((g) => (
          <View key={g.id}>
            <Text style={s.group} {...deckLabelProps} accessibilityRole="header">{g.label}</Text>
            {PRIVILEGES.filter((p) => p.group === g.id && p.ledger).map((p) => (
              <View key={p.id} style={s.row} accessible accessibilityLabel={`${p.ledger}: ${holders(p.rank)}.`}>
                <Text style={s.name} {...scaledTextProps} {...UNSPOKEN}>{p.ledger}</Text>
                {COLUMNS.map((c) => (
                  <View key={c.id} style={[s.cell, { width: c.width }]} {...UNSPOKEN}>
                    {rankIncludes(c.id, p.rank)
                      ? <View style={[s.yes, c.id === 'auteur' && s.yesAuteur]} />
                      : <View style={s.no} />}
                  </View>
                ))}
              </View>
            ))}
          </View>
        ))}
      </View>
    </View>
  );
});

/** The columns, in order — checked against RANK_ORDER by the Society's tests. */
export const LEDGER_COLUMN_ORDER: RankId[] = COLUMNS.map((c) => c.id);

const s = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 40 },
  heading: { alignItems: 'center' },
  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  keyRule: { width: 26, height: 1, backgroundColor: colors.tarnish },
  key: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },
  title: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.silverScreen, textAlign: 'center', marginTop: 8 },
  note: { fontFamily: fonts.bodyItalic, fontSize: 14, lineHeight: 20, color: colors.bone, textAlign: 'center', marginTop: 6 },

  table: {
    marginTop: 16,
    borderTopWidth: 3, borderBottomWidth: 3, borderColor: colors.sepiaBorderStrong,
  },
  headRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.sepiaBorderStrong },
  cellName: { flex: 1 },
  cell: { alignItems: 'center', justifyContent: 'center' },
  col: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 0.4, color: colors.bone, includeFontPadding: false },
  colArchivist: { color: colors.sepia },
  colAuteur: { color: colors.crimsonInk },
  group: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.sepia, paddingTop: 14, paddingBottom: 4, includeFontPadding: false },
  row: {
    flexDirection: 'row', alignItems: 'center', minHeight: 40,
    borderTopWidth: 1, borderTopColor: colors.sepiaSubtle,
  },
  name: { flex: 1, fontFamily: fonts.body, fontSize: 13, lineHeight: 17, color: colors.parchment, paddingVertical: 8, paddingRight: 6 },
  yes: { width: 9, height: 9, backgroundColor: colors.sepia, transform: [{ rotate: '45deg' }] },
  yesAuteur: { backgroundColor: colors.crimsonInk },
  // A dash, dim enough to read as "not here" beside a diamond, never as a mark.
  no: { width: 10, height: 1.5, backgroundColor: colors.tarnishDeep },
});
