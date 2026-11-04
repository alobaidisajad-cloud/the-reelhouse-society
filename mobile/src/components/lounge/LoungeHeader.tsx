/**
 * The head of the Lounge's page: "The Lounge", the line that says what the viewer's rank lets
 * them do there, and the front desk: the search and ESTABLISH. ESTABLISH is shown to every member
 * and answers by rank: the register for a member who may found a salon, the house's rope (the
 * key) for one who may not yet. ESTABLISH stands under the search, the desk's width, before either is cut.
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { Search, Plus, X, KeyRound } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { SEARCH_MAX } from '@/src/constants/inputLimits';
import { ceilingFor, lineWidth } from '@/src/components/lobby/measure';
import { useTextScale } from '@/src/hooks/useTextScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { CORRIDOR } from './corridor';

const HINT = 'Search salons…';
const FIELD = { size: 14, pad: 14, icon: 15, gap: 10, least: 200 } as const;

export const LoungeHeader = React.memo(function LoungeHeader({ seated, mayFound, query, onQuery, onEstablish }: {
  /** The viewer's rank takes a seat (the-lounge): what the rank line says. */
  seated: boolean;
  /** The viewer's rank founds a salon (create-a-lounge): ESTABLISH's face. */
  mayFound: boolean;
  query: string;
  onQuery: (q: string) => void;
  onEstablish: () => void;
}) {
  const desk = useColumnWidth() - 2 * CORRIDOR.page;
  // ESTABLISH beside the search while the search keeps its least; else under it, the desk's width.
  const establishWidth = 2 * 16 + 15 + 8 + lineWidth('ESTABLISH', 'elite', 11, useTextScale(), 2);
  const stacked = desk - 8 - establishWidth < FIELD.least;
  const fieldWidth = stacked ? desk : desk - 8 - establishWidth;
  // The hint grows with the member's text no further than it fits the field whole (Courier is even).
  const room = fieldWidth - 2 * FIELD.pad - FIELD.icon - FIELD.gap - 2;
  const hintCap = Math.min(scaledTextProps.maxFontSizeMultiplier, ceilingFor(HINT, 'courierItalic', FIELD.size, 0, room));
  return (
    <View style={s.head}>
      <Text style={s.title} {...displayTextProps} accessibilityRole="header">The Lounge</Text>
      {/* What the rank gives, said to both sides of it in the same words. */}
      <Text style={s.rankLine} {...scaledTextProps}>
        {seated ? 'READ ANY SALON · TAKE YOUR SEAT' : 'READ ANY SALON · ARCHIVISTS TAKE A SEAT'}
      </Text>

      <View style={[s.desk, stacked && s.deskStacked]}>
        <View style={s.field}>
          <Search size={FIELD.icon} color={query ? colors.sepia : colors.fog} />
          <TextInput
            style={[s.input, !query && s.inputHint]}
            allowFontScaling
            maxFontSizeMultiplier={hintCap}
            placeholder={HINT}
            placeholderTextColor={colors.fog}
            value={query}
            onChangeText={onQuery}
            maxLength={SEARCH_MAX}
            selectionColor={colors.selection}
            keyboardAppearance="dark"
            returnKeyType="search"
            accessibilityLabel="Search salons"
            autoCorrect={false}
            spellCheck={false}
          />
          {query.length > 0 && (
            <PressableScale onPress={() => onQuery('')} style={s.clear} hitSlop={null} haptic="selection"
              accessibilityRole="button" accessibilityLabel="Clear the search">
              <X size={FIELD.icon} color={colors.fog} />
            </PressableScale>
          )}
        </View>
        <PressableScale style={[s.establish, !mayFound && s.establishRope]} onPress={onEstablish} haptic="medium" hitSlop={null}
          accessibilityRole="button"
          accessibilityLabel={mayFound ? 'Establish a salon' : 'Establish a salon. The Archivist opens this. Opens the Society.'}>
          {mayFound ? <Plus size={15} color={colors.ink} strokeWidth={2.2} /> : <KeyRound size={15} color={colors.sepia} strokeWidth={2} />}
          <Text style={[s.establishWord, !mayFound && s.establishWordRope]} {...scaledTextProps}>ESTABLISH</Text>
        </PressableScale>
      </View>
    </View>
  );
});

const s = StyleSheet.create({
  head: { paddingTop: 10 },
  title: { fontFamily: fonts.display, fontSize: 30, lineHeight: 36, color: colors.silverScreen, textAlign: 'center' },
  rankLine: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, textAlign: 'center', marginTop: 6, includeFontPadding: false },
  desk: { flexDirection: 'row', gap: 8, marginTop: 16 },
  deskStacked: { flexDirection: 'column' },
  field: {
    flexGrow: 1, flexShrink: 1, minHeight: 50, borderRadius: CORRIDOR.radius,
    backgroundColor: colors.well, borderWidth: 1, borderColor: 'rgba(184,137,26,0.75)',
    flexDirection: 'row', alignItems: 'center', gap: FIELD.gap, paddingHorizontal: FIELD.pad,
  },
  input: { flex: 1, minHeight: 48, paddingVertical: 0, paddingHorizontal: 0, fontFamily: fonts.body, fontSize: FIELD.size, color: colors.parchment },
  inputHint: { fontFamily: fonts.bodyItalic },
  clear: { width: 48, height: 48, marginRight: -12, alignItems: 'center', justifyContent: 'center' },
  establish: {
    minHeight: 50, paddingHorizontal: 16, borderRadius: CORRIDOR.radius, backgroundColor: colors.sepia,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  // Below the rank: the rope, the key in brass on the ground, never a dead button.
  establishRope: { backgroundColor: 'transparent', borderWidth: 1, borderColor: 'rgba(184,137,26,0.6)' },
  establishWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 2, color: colors.ink, includeFontPadding: false },
  establishWordRope: { color: colors.sepia },
});
