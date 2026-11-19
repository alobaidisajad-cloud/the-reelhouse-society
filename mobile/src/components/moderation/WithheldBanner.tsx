/**
 * WithheldBanner — a piece of the member's own that the house withholds, marked as withheld wherever its
 * author reads it (round 14): its own page (a log, a stack, a filing), a critique of theirs. A member
 * must never believe others can read what the house withholds, so the page never stands as if public:
 * the banner says no one but they can read it, until when it is kept unappealed (or that it waits for its
 * hearing), and opens the verdict whole (VerdictSheet), where they may appeal it.
 *
 * WithheldStamp is the same word on a row of theirs in a list (their room's records and stacks): no
 * control, its row says it.
 */
import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { VerdictSheet, appealByWords } from '@/src/components/moderation/VerdictSheet';
import { useWithheldPiece } from '@/src/hooks/useMyWithheld';
import type { WithheldPiece } from '@/src/services/ModerationService';
import { colors, fonts, radii } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';

export const WITHHELD_TITLE = 'WITHHELD BY THE HOUSE';

/** What the banner says of a withheld piece: who can read it, and until when it is kept. */
export function withheldLine(piece: Pick<WithheldPiece, 'appeal_by' | 'appealed'> | null): string {
  if (piece?.appealed) return 'No one but you can read this. It is kept whole until your appeal is heard.';
  if (piece?.appeal_by) {
    return `No one but you can read this. Appeal by ${appealByWords(piece.appeal_by)} and it is kept whole until your appeal is heard; unappealed, it is deleted then.`;
  }
  return 'No one but you can read this.';
}

/**
 * Drawn for the member's own piece when the house withholds it: by its row's own word (withheldAt, read
 * with the page) or by the member's list of their withheld pieces, which names the verdict and the date.
 */
export function WithheldBanner({ pieceId, withheldAt, compact = false }: {
  pieceId: string | null | undefined;
  withheldAt?: string | null;
  compact?: boolean;
}) {
  const piece = useWithheldPiece(pieceId, { reread: !compact });
  const [open, setOpen] = useState<string | null>(null);
  if (!piece && !withheldAt) return null;
  const line = withheldLine(piece);
  return (
    <View style={[st.plate, compact && st.compact]} testID="withheld-banner">
      <View accessible accessibilityRole="text" accessibilityLabel={`Withheld by the house. ${line}`}>
        <Text style={st.title}>{WITHHELD_TITLE}</Text>
        <Text style={[st.line, compact && st.lineCompact]}>{line}</Text>
      </View>
      {!!piece?.verdict_id && (
        <PressableScale
          style={st.act}
          onPress={() => { TactileEngine.selection(); setOpen(piece.verdict_id); }}
          haptic="selection"
          pressedScale={0.97}
          accessibilityRole="button"
          accessibilityLabel="Read the verdict"
        >
          <Text style={st.actText}>READ THE VERDICT</Text>
        </PressableScale>
      )}
      <VerdictSheet verdictId={open} onClose={() => setOpen(null)} />
    </View>
  );
}

/** The word on a row of the member's own that the house withholds. Its row says it in its label. */
export function WithheldStamp({ pieceId }: { pieceId: string | null | undefined }) {
  const piece = useWithheldPiece(pieceId);
  if (!piece) return null;
  return (
    <View style={st.stamp} {...UNSPOKEN_STAMP}>
      <Text style={st.stampText}>WITHHELD</Text>
    </View>
  );
}

/** The same word as a band across the foot of a poster of the member's own (their room's grid). */
export function WithheldBand({ pieceId }: { pieceId: string | null | undefined }) {
  const piece = useWithheldPiece(pieceId);
  if (!piece) return null;
  return (
    <View style={st.band} pointerEvents="none" {...UNSPOKEN_STAMP}>
      <Text style={st.stampText} numberOfLines={1}>WITHHELD</Text>
    </View>
  );
}

/** A row's label, with what the stamp shows when its piece is withheld. */
export function useWithheldSaid(pieceId: string | null | undefined): string {
  return useWithheldPiece(pieceId) ? ', withheld by the house' : '';
}

/** The stamp is said by its row's label, not as a stop of its own. */
const UNSPOKEN_STAMP = { accessible: false, importantForAccessibility: 'no-hide-descendants' as const, accessibilityElementsHidden: true };

const st = StyleSheet.create({
  plate: {
    borderWidth: 1,
    borderColor: colors.bloodReel,
    borderLeftWidth: 3,
    borderLeftColor: colors.crimson,
    backgroundColor: colors.soot,
    borderRadius: radii.sm,
    padding: 14,
    gap: 6,
    marginBottom: 16,
  },
  compact: { padding: 10, marginTop: 8, marginBottom: 8 },
  title: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2.5, color: colors.crimsonInk },
  line: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 19 },
  lineCompact: { fontSize: 12, lineHeight: 17 },
  // The one act: 48 tall by its own box.
  act: {
    alignSelf: 'flex-start',
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.crimson,
    borderRadius: radii.sm,
  },
  actText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.crimsonInk },
  // On a member's room red is the Auteur's alone: the stamp is the house's paper and ink, not its alarm.
  stamp: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.bone,
    borderRadius: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 4,
  },
  stampText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.parchment },
  band: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(13,11,9,0.88)',
    borderTopWidth: 1, borderTopColor: colors.bone,
    paddingVertical: 2, alignItems: 'center',
  },
});
