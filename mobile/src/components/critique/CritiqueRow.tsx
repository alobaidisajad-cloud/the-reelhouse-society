/**
 * CritiqueRow — one critique, as the house draws it under a log and in a
 * stack's critiques: the byline (avatar and handle, both opening the profile),
 * the date, the words, and one control at the foot — the house's own, as the
 * Dispatch has it:
 *
 *   yours            WITHDRAW, and it asks first (askToWithdrawCritique)
 *   anyone else's    REPORT, in plain sight; its sheet can also block
 *   a former member  nothing: there is nobody left to report
 *
 * One is never shown in place of the other.
 *
 * The row itself is not a control. It was once a long press, and a long press
 * on a whole row made it ONE element to a screen reader: the author's name and
 * the member's own control inside it could not be reached. And a report behind
 * a gesture is a report few members ever find.
 *
 * One row for both pages. The stack drew its own copy, and a fix made to one
 * copy never reached the other.
 */
import { s } from '@/src/components/log/logDetailStyles';
import PressableScale from '@/src/components/PressableScale';
import { formatDate } from '@/src/utils/timeAgo';
import { isRTLText } from '@/src/utils/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/text';
import { askToWithdrawCritique } from './withdraw';

export interface Critique {
  id: string;
  /** Null once its author has left the house: the words stay, the name goes. */
  user_id: string | null;
  username: string;
  avatar_url?: string | null;
  body: string;
  created_at: string;
}

/**
 * Two controls sit 28pt apart across a row boundary: this critique's WITHDRAW
 * or REPORT, and the profile link of the critique filed after it (14pt of
 * padding each side of the hairline). At the default 15 they claimed 30pt
 * between them and overlapped by two — and an overlap always goes to the LATER
 * control, so the bottom of the one opened the next member's profile instead.
 *
 * Half the real gap each. Both keep the full 15 on the side facing nothing.
 */
const HITSLOP_BYLINE = { top: 14, bottom: 15, left: 15, right: 15 } as const;
const HITSLOP_ACTION = { top: 15, bottom: 14, left: 15, right: 15 } as const;

/**
 * Another member's critique, to report. Not one's own, and not a former
 * member's: there is nobody left to report.
 */
const reportable = (c: Critique, currentUserId?: string): c is Critique & { user_id: string } =>
  !!c.user_id && c.user_id !== currentUserId;

export const CritiqueRow = React.memo(function CritiqueRow({
  c,
  currentUserId,
  onWithdraw,
  onPressUser,
  onReport,
}: {
  c: Critique;
  currentUserId?: string;
  /** Called once the member has said yes to withdrawing their own. */
  onWithdraw: (id: string) => void;
  onPressUser: (username: string) => void;
  /** Another member's critique, to the report sheet. Absent: no REPORT is drawn. */
  onReport?: (critique: Critique & { user_id: string }) => void;
}) {
  const mine = !!currentUserId && currentUserId === c.user_id;
  return (
    <View style={s.commentItem}>
      <View style={s.commentTopRow}>
        {/* A critique outlives its author: deleting an account keeps the words and
            drops the name, leaving user_id null and the handle a tombstone. There
            is no profile behind it, so the byline must not behave like a button —
            it used to open a profile page for someone who no longer exists. */}
        <PressableScale
          style={s.commentByline}
          onPress={c.user_id ? () => onPressUser(c.username) : undefined}
          disabled={!c.user_id}
          hitSlop={HITSLOP_BYLINE}
          pressedScale={c.user_id ? 0.96 : 1}
          haptic={c.user_id ? 'selection' : undefined}
          accessibilityRole={c.user_id ? 'link' : undefined}
          accessibilityLabel={c.user_id ? `View profile of @${c.username}` : `Critique by a former member`}
        >
          {c.avatar_url ? (
            <Image source={{ uri: c.avatar_url }} style={s.commentAvatar} cachePolicy="memory-disk" contentFit="cover" transition={150} />
          ) : (
            <View style={s.commentAvatar}>
              <Text style={s.commentAvatarText}>{(c.username || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={s.commUsername} numberOfLines={1}>@{c.username}</Text>
        </PressableScale>
        {/* The archive's own date shape — this printed the device's short form,
            8/5/2026, directly beneath the record's AUG 5, 2026.
            `formatDate`, not a local one: `created_at` is an INSTANT, so it has
            to render on the reader's clock. A critique filed at 8pm in Los
            Angeles is dated that evening, not the following morning. */}
        <Text style={s.commDate}>{formatDate(c.created_at)}</Text>
      </View>
      <Text style={[s.commBody, isRTLText(c.body) && s.rtlText]} {...scaledTextProps} selectable>{c.body}</Text>
      {mine ? (
        <PressableScale
          onPress={() => askToWithdrawCritique(() => onWithdraw(c.id))}
          style={s.commActionBtn}
          hitSlop={HITSLOP_ACTION}
          // `medium`, not a warning knock: this only asks; the answer carries the weight.
          haptic="medium"
          pressedScale={0.92}
          accessibilityRole="button"
          // "WITHDRAW" alone, among many critiques, does not say whose or what.
          accessibilityLabel="Withdraw your critique"
        >
          <Text style={s.commWithdraw} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            WITHDRAW
          </Text>
        </PressableScale>
      ) : reportable(c, currentUserId) && onReport ? (
        <PressableScale
          onPress={() => onReport(c)}
          style={s.commActionBtn}
          hitSlop={HITSLOP_ACTION}
          haptic="selection"
          pressedScale={0.92}
          accessibilityRole="button"
          accessibilityLabel={`Report this critique by @${c.username}`}
        >
          <Text style={s.commReport} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            REPORT
          </Text>
        </PressableScale>
      ) : null}
    </View>
  );
});
