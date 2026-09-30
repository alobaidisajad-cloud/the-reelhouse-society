/**
 * CritiqueRow — one critique, as the house draws it under a log and in a
 * stack's critiques: the byline (avatar and handle, both opening the profile),
 * the date, the words, and DELETE on one's own. A long press on anyone else's
 * offers report and block.
 *
 * One row for both. The stack drew its own copy, and the copy kept the reach
 * this one had already been measured out of: each row claimed 15pt of the
 * next, so a long press at the foot of one critique opened the report sheet
 * for the next member's, and the avatar below took taps meant for the row
 * above. A fix made to one copy never reached the other.
 */
import { s } from '@/src/components/log/logDetailStyles';
import PressableScale from '@/src/components/PressableScale';
import { formatDate } from '@/src/utils/timeAgo';
import { isRTLText } from '@/src/utils/text';
import { scaledTextProps } from '@/src/constants/textScaling';
import TactileEngine from '@/src/utils/TactileEngine';
import { Image } from 'expo-image';
import React from 'react';
import { View } from 'react-native';
import { Text } from '@/src/components/text';

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
 * Two controls sit 28pt apart across a row boundary: your own DELETE, and the
 * profile link of the critique filed after it (14pt of padding each side of the
 * hairline). At the default 15 they claimed 30pt between them and overlapped by
 * two — and an overlap always goes to the LATER control, so the bottom of
 * DELETE opened the next member's profile instead.
 *
 * Half the real gap each. Both keep the full 15 on the side facing nothing.
 */
const HITSLOP_BYLINE = { top: 14, bottom: 15, left: 15, right: 15 } as const;
const HITSLOP_DELETE = { top: 15, bottom: 14, left: 15, right: 15 } as const;

/**
 * And the ROW ITSELF, which that sweep missed — it looked at the controls
 * inside the critique and not at the critique.
 *
 * Critiques are flush: `commentItem` separates them with a hairline and nothing
 * else. The wrapper carried no hitSlop at all, so it took the default 15 on
 * every side and each row's target reached 15pt into the one after it. In an
 * overlap the LATER row wins, so a long press near the foot of a critique
 * opened the report-and-block sheet for the NEXT member's. There is no gap to
 * halve, so there is nothing to claim; the row is already 14pt-padded and full
 * width, and loses no reachable area.
 */
const HITSLOP_ROW = { top: 0, bottom: 0, left: 0, right: 0 } as const;

/**
 * Another member's critique, to report or block by a long press. Not one's
 * own, and not a former member's: there is nobody left to report or block.
 */
const reportable = (c: Critique, currentUserId?: string): c is Critique & { user_id: string } =>
  !!c.user_id && c.user_id !== currentUserId;

export const CritiqueRow = React.memo(function CritiqueRow({
  c,
  currentUserId,
  onDelete,
  onPressUser,
  onLongPress,
}: {
  c: Critique;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onPressUser: (username: string) => void;
  onLongPress?: (critique: Critique & { user_id: string }) => void;
}) {
  return (
    <PressableScale
      onLongPress={() => {
        if (reportable(c, currentUserId) && onLongPress) {
          TactileEngine.destroy();
          onLongPress(c);
        }
      }}
      delayLongPress={400}
      hitSlop={HITSLOP_ROW}
      pressedScale={0.98}
      accessibilityLabel={`Critique by ${c.username}`}
      accessibilityHint={reportable(c, currentUserId) && onLongPress ? 'Long press to report or block' : undefined}
    >
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
        {currentUserId === c.user_id && (
          <PressableScale
            onPress={() => onDelete(c.id)}
            style={s.commDeleteBtn}
            hitSlop={HITSLOP_DELETE}
            haptic="heavy"
            pressedScale={0.92}
            // "DELETE" alone, among many critiques, does not say whose or what.
            accessibilityLabel="Delete your critique"
          >
            <Text style={s.commDelete} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              DELETE
            </Text>
          </PressableScale>
        )}
      </View>
    </PressableScale>
  );
});
