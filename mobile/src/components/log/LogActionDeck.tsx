import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { Heart, MessageSquare, Edit3, MessageCircle, Bookmark, KeyRound } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { UNINKED } from '@/src/theme/unready';
import { deckLabelProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { MarkFigure, certifyLabel, critiqueLabel } from '@/src/components/MarkFigure';
import { PAGE } from '@/src/components/log/pageMetrics';

/**
 * The opened log's action band: the frame's own, across the whole page. Its words are constant,
 * as the frame's are: the heart's ink says certified, the bookmark's says saved.
 */
interface LogActionDeckProps {
  isOwner: boolean;
  endorsed: boolean;
  /**
   * Whether the house answered the member's own certification: false for a log drawn from
   * the phone. Then the heart is its outline before the ink, and is never drawn as not given.
   */
  certifyKnown?: boolean;
  /** The two counts, beside their icons. Null when not known yet. */
  certifyCount: number | null;
  critiqueCount: number | null;
  /** Whether this film is already in the member's watchlist. */
  filmSaved: boolean;
  /**
   * Whether their watchlist is held whole (marksLedger): until then a film not in it is not
   * known to be unsaved, and its bookmark is the outline before the ink. A press is still
   * right: a film already saved is said as saved.
   */
  saveKnown?: boolean;
  onToggleEndorse: () => void;
  onCritiquePress: () => void;
  onSavePress: () => void;
  onEditPress: () => void;
  onLoungePress: () => void;
  /** Whether the reader may share into a salon, and what LOUNGE says aloud: without the rank, the press opens the rope. */
  lounge: { held: boolean; spoken: string };
}

export default function LogActionDeck({
  isOwner, endorsed, certifyKnown = true, certifyCount, critiqueCount, filmSaved, saveKnown = true,
  onToggleEndorse, onCritiquePress, onSavePress, onEditPress, onLoungePress, lounge,
}: LogActionDeckProps) {
  return (
    <View style={st.band}>
      <PressableScale style={st.act} onPress={onToggleEndorse} hitSlop={null} haptic="light" pressedScale={0.92}
        accessibilityRole="button" accessibilityState={{ selected: endorsed, busy: !certifyKnown }}
        accessibilityLabel={certifyKnown ? certifyLabel(certifyCount, false, 'this critique') : 'Certify this critique. Reading your mark'}>
        <MarkFigure iconSize={16} count={certifyCount} style={[st.word, endorsed && st.wordCertified]}>
          <Heart size={16} strokeWidth={2} color={endorsed ? colors.crimsonInk : colors.fog} fill={endorsed ? colors.crimsonInk : 'transparent'}
            strokeDasharray={certifyKnown ? undefined : UNINKED} />
        </MarkFigure>
        <Text style={[st.word, endorsed && st.wordCertified]} {...deckLabelProps}>CERTIFY</Text>
      </PressableScale>

      {/* CRITIQUE — to the critiques, the field ready. */}
      <PressableScale style={st.act} onPress={onCritiquePress} hitSlop={null} haptic="selection" pressedScale={0.92}
        accessibilityRole="button" accessibilityLabel={critiqueLabel(critiqueCount, 'Write a critique')}>
        <View style={st.divider} pointerEvents="none" />
        <MarkFigure iconSize={16} count={critiqueCount} style={st.word}>
          <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
        </MarkFigure>
        <Text style={st.word} {...deckLabelProps}>CRITIQUE</Text>
      </PressableScale>

      {/* Your own record offers EDIT, someone else's SAVE, as the frame's band does. */}
      {isOwner ? (
        <PressableScale style={st.act} onPress={onEditPress} hitSlop={null} haptic="light" pressedScale={0.92}
          accessibilityRole="button" accessibilityLabel="Edit this log">
          <View style={st.divider} pointerEvents="none" />
          <Edit3 size={16} strokeWidth={2} color={colors.sepia} />
          <Text style={[st.word, st.wordBrass]} {...deckLabelProps}>EDIT</Text>
        </PressableScale>
      ) : (
        <PressableScale touch="commit" style={st.act} onPress={onSavePress} hitSlop={null} haptic="light" pressedScale={0.92}
          accessibilityRole="button" accessibilityState={{ selected: filmSaved }}
          accessibilityLabel={filmSaved ? 'Save: on your watchlist. Takes it off' : 'Save film to your watchlist'}>
          <View style={st.divider} pointerEvents="none" />
          <Bookmark size={16} strokeWidth={2} color={filmSaved ? colors.sepia : colors.fog} fill={filmSaved ? colors.sepia : 'transparent'}
            strokeDasharray={saveKnown ? undefined : UNINKED} />
          <Text style={[st.word, filmSaved && st.wordBrass]} {...deckLabelProps}>SAVE</Text>
        </PressableScale>
      )}

      {/* LOUNGE — shares this log into a salon; who may not speak there holds the brass key. */}
      <PressableScale style={st.act} onPress={onLoungePress} hitSlop={null} haptic="medium" pressedScale={0.92}
        accessibilityRole="button" accessibilityLabel={lounge.spoken}>
        <View style={st.divider} pointerEvents="none" />
        {lounge.held
          ? <MessageCircle size={16} strokeWidth={2} color={colors.fog} />
          : <KeyRound size={16} strokeWidth={2} color={colors.sepia} style={st.keyDim} />}
        <Text style={[st.word, !lounge.held && st.wordBrass]} {...deckLabelProps}>LOUNGE</Text>
      </PressableScale>
    </View>
  );
}

const st = StyleSheet.create({
  // Across the whole page: the body's margin taken back on each side.
  band: { flexDirection: 'row', minHeight: PAGE.band, marginTop: PAGE.section, marginHorizontal: -PAGE.pad, backgroundColor: colors.inkwell },
  // As tall as the band: a halo would only reach out of it.
  act: { flex: 1, minWidth: 0, minHeight: PAGE.band, paddingVertical: 8, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center', gap: 6 },
  /** Between two acts: a fine rule, inset from the band's edges. */
  divider: { position: 'absolute', left: 0, top: 19, bottom: 19, width: StyleSheet.hairlineWidth * 2, backgroundColor: colors.ash },
  word: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.8, color: colors.fog, includeFontPadding: false },
  wordCertified: { color: colors.crimsonInk },
  wordBrass: { color: colors.sepia },
  keyDim: { opacity: 0.75 },
});
