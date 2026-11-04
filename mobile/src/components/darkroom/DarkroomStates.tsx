/**
 * The Darkroom's states, each on the room's soot: a search that matched nothing, settings that
 * develop nothing, the archives unreachable with nothing kept; and the contact sheet's foot, which
 * says what comes next: the next batch developing, the next batch failed, or the end of the sheet.
 */
import React, { memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import Buster from '@/src/components/Buster';
import { EmptyOffline } from '@/src/components/EmptyStates';
import PressableScale from '@/src/components/PressableScale';
import { TryAgainLine } from '@/src/components/TryAgain';
import { colors, fonts } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { ROOM, SHEET } from './sheet';

/** Nothing developed: why, in the room's words, and the one way on. */
export const NothingDeveloped = memo(function NothingDeveloped({ searching, onPress }: { searching: boolean; onPress: () => void }) {
  return (
    <View style={st.frame}>
      <Buster size={56} mood="suspicious" />
      <Text style={st.title} {...displayTextProps} accessibilityRole="header">
        {searching ? 'The negatives hold no match.' : 'Nothing surfaced in the tray.'}
      </Text>
      <Text style={st.words} {...scaledTextProps}>
        {searching ? 'No films match that search. Try a different title.' : 'Adjust your filters to develop something new.'}
      </Text>
      <PressableScale style={st.button} onPress={onPress} haptic="medium" hitSlop={null}
        accessibilityRole="button" accessibilityLabel={searching ? 'Clear search' : 'Reset filters'}>
        <Text style={st.buttonWord} {...scaledTextProps}>{searching ? 'CLEAR SEARCH' : 'RESET FILTERS'}</Text>
      </PressableScale>
    </View>
  );
});

/** The archives out of reach and nothing kept: offline it asks again by itself; reached but refused, the member asks. */
export const ArchivesUnreached = memo(function ArchivesUnreached({ onRetry }: { onRetry?: () => void }) {
  return (
    <View style={[st.frame, st.unreached]}>
      <EmptyOffline onRetry={onRetry} />
    </View>
  );
});

/** The sheet's foot, closing it: and what comes next, when anything does. */
export const SheetFoot = memo(function SheetFoot({ state, onRetry }: {
  state: 'developing' | 'failed' | 'end' | null;
  onRetry: () => void;
}) {
  return (
    <View style={st.foot}>
      {state === 'developing' ? <Text style={st.developing} {...scaledTextProps}>[ DEVELOPING THE NEXT BATCH... ]</Text> : null}
      {state === 'failed' ? (
        <View style={st.failed}>
          <Text style={st.failedWords} {...scaledTextProps}>THE NEXT BATCH COULD NOT BE DEVELOPED.</Text>
          <TryAgainLine onPress={onRetry} what="develop the next batch" style={st.tryLine} />
        </View>
      ) : null}
      {state === 'end' ? (
        <View style={st.end} accessible accessibilityLabel="End of sheet">
          <View style={st.endRule} />
          <Text style={st.endWord} {...scaledTextProps} {...UNSPOKEN}>END OF SHEET</Text>
          <View style={st.endRule} />
        </View>
      ) : null}
    </View>
  );
});

const st = StyleSheet.create({
  frame: {
    marginTop: 14, backgroundColor: colors.soot, borderRadius: ROOM.radius,
    alignItems: 'center', paddingTop: 40, paddingHorizontal: 24, paddingBottom: 36,
  },
  unreached: { marginTop: 20 },
  title: { fontFamily: fonts.display, fontSize: 17, lineHeight: 24, letterSpacing: 0.5, color: colors.parchment, textAlign: 'center', marginTop: 14 },
  words: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 20, color: colors.fog, textAlign: 'center', maxWidth: 280, marginTop: 8 },
  button: {
    marginTop: 18, minHeight: 48, paddingHorizontal: 22, justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 3,
  },
  buttonWord: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, includeFontPadding: false },
  foot: {
    backgroundColor: colors.inkwell, borderBottomLeftRadius: ROOM.radius, borderBottomRightRadius: ROOM.radius,
    paddingHorizontal: SHEET.pad, paddingBottom: 4,
  },
  developing: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.4, color: colors.fog, textAlign: 'center', paddingTop: 14, paddingBottom: 14, includeFontPadding: false },
  failed: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 10, paddingVertical: 6 },
  failedWords: { flexShrink: 1, fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, lineHeight: 16, color: colors.bone },
  tryLine: { minHeight: 44, justifyContent: 'center' },
  end: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 12 },
  endRule: { flex: 1, height: StyleSheet.hairlineWidth * 2, backgroundColor: 'rgba(232,223,208,0.1)' },
  endWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, includeFontPadding: false },
});
