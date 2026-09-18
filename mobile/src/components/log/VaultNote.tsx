import React from 'react';
import { View, Text } from 'react-native';
import { Lock, ChevronRight } from 'lucide-react-native';
import { colors } from '@/src/theme/theme';
import { isRTLText } from '@/src/utils/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import PressableScale from '@/src/components/PressableScale';
import { s } from '@/src/components/log/logDetailStyles';

/**
 * A private note, as the member's own page shows it.
 *
 * ── WHO SEES THIS ──────────────────────────────────────────────────────────
 * Only the member who wrote it, ever. The caller decides that — this component
 * is never handed a note that is not the reader's own — and the server agrees:
 * `log_private_notes` is owner-only, and nothing else can read the row.
 *
 * ── WHY IT LOOKS LIKE THIS ─────────────────────────────────────────────────
 *  · NO FRAME. A brass rule down one side and a faint wash, so it reads as part
 *    of the writing above it rather than a third box between two others.
 *  · A LOCK, not a key. A key already means "a rank you do not hold" everywhere
 *    else in the house; this is the opposite — something only you may open.
 *  · ONE line of chrome. No date: the viewing it belongs to already carries one,
 *    and repeating it says the note was written on a day rather than about a
 *    viewing.
 *  · The whole note is one control. Tapping opens it in full, where it can be
 *    removed, so nothing destructive sits on a page made for reading.
 *  · On a chronicle card it is clamped to three lines, so one long note cannot
 *    swell the carousel every other viewing has to match.
 */
export default function VaultNote({
  note,
  onOpen,
  compact = false,
  inPanel = false,
}: {
  note: string;
  /** Opens the note in full. Without it the note is text, not a control. */
  onOpen?: () => void;
  /** Inside a chronicle card: tighter, and clamped to three lines. */
  compact?: boolean;
  /** Inside the form's own "THE VAULT" panel, where the name is said above. */
  inPanel?: boolean;
}) {
  const body = (note ?? '').trim();
  if (!body) return null;

  const rtl = isRTLText(body);

  const content = (
    <View style={[s.vaultNote, compact ? s.vaultNoteCompact : s.vaultNoteFull]}>
      <View style={[s.vaultNoteHeader, compact && s.vaultNoteHeaderCompact]}>
        <Lock size={compact ? 9 : 10} color={colors.sepia} strokeWidth={2} />
        <Text style={[s.vaultNoteLabel, compact && s.vaultNoteLabelCompact]} numberOfLines={1}>
          {inPanel ? null : <Text style={s.vaultNoteLabelName}>THE VAULT</Text>}
          <Text style={s.vaultNoteLabelWho}>{inPanel ? 'ONLY YOU' : '  ·  ONLY YOU'}</Text>
        </Text>
        {onOpen ? <ChevronRight size={12} color={colors.fog} strokeWidth={1.5} /> : null}
      </View>
      <Text
        numberOfLines={compact ? 3 : undefined}
        style={[compact ? s.vaultNoteBodyCompact : s.vaultNoteBody, rtl && s.rtlText]}
        {...scaledTextProps}
      >
        {body}
      </Text>
    </View>
  );

  if (!onOpen) return content;

  return (
    <PressableScale
      onPress={onOpen}
      accessibilityRole="button"
      // Read as one thing: what it is, then what it says. Without the label a
      // reader hears the note with no idea it is private, which is the single
      // most important thing about it.
      accessibilityLabel={`Your private note. ${body}`}
      accessibilityHint="Opens the note"
    >
      {content}
    </PressableScale>
  );
}
