
import { s } from '@/src/components/log/logDetailStyles';
import { SectionDivider } from '@/src/components/Decorative';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { Image } from 'expo-image';
import { Sparkles, ChevronDown } from 'lucide-react-native';
import React, { RefObject, useMemo, useState } from 'react';
import { Text, TextInput, View } from 'react-native';

interface LogComment {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string | null;
  body: string;
  created_at: string;
}

const PAGE = 12;
const HITSLOP = { top: 15, bottom: 15, left: 15, right: 15 } as const;

// ── Memoized Critique Row — avatar + handle both open the profile, no dead ends ──
const CommentRow = React.memo(({
  c,
  currentUserId,
  onDelete,
  onPressUser,
  onLongPress,
}: {
  c: LogComment;
  currentUserId?: string;
  onDelete: (id: string) => void;
  onPressUser: (username: string) => void;
  onLongPress?: (comment: LogComment) => void;
}) => (
  <PressableScale
    onLongPress={() => {
      if (c.user_id !== currentUserId && onLongPress) {
        TactileEngine.destroy();
        onLongPress(c);
      }
    }}
    delayLongPress={400}
    pressedScale={0.98}
    accessibilityLabel={`Critique by ${c.username}`}
    accessibilityHint={c.user_id !== currentUserId ? 'Long press to report or block' : undefined}
  >
    <View style={s.commentItem}>
      <View style={s.commentTopRow}>
        <PressableScale
          style={s.commentByline}
          onPress={() => onPressUser(c.username)}
          hitSlop={HITSLOP}
          pressedScale={0.96}
          haptic="selection"
          accessibilityLabel={`View profile of @${c.username}`}
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
        <Text style={s.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
      </View>
      <Text style={s.commBody} selectable>{c.body}</Text>
      {currentUserId === c.user_id && (
        <PressableScale
          onPress={() => onDelete(c.id)}
          style={s.commDeleteBtn}
          hitSlop={HITSLOP}
          haptic="heavy"
          pressedScale={0.92}
        >
          <Text style={s.commDelete} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
            DELETE
          </Text>
        </PressableScale>
      )}
    </View>
  </PressableScale>
));

CommentRow.displayName = 'CommentRow';

interface LogCommentsProps {
  comments: LogComment[];
  /**
   * The TRUE number of critiques on this log. The list above is one bounded
   * page, so counting it would under-report the moment a thread outgrows the
   * page — which is why the fetch could not simply be given a limit.
   */
  commentTotal?: number;
  currentUserId?: string;
  newComment: string;
  posting: boolean;
  critiqueInputRef: RefObject<TextInput>;
  onNewCommentChange: (text: string) => void;
  onPostComment: () => void;
  onDeleteComment: (id: string) => void;
  onPressUser: (username: string) => void;
  onLongPressComment?: (comment: LogComment) => void;
  onSectionLayout?: (y: number) => void;
}

export default function LogComments({
  comments,
  commentTotal,
  currentUserId,
  newComment,
  posting,
  critiqueInputRef,
  onNewCommentChange,
  onPostComment,
  onDeleteComment,
  onPressUser,
  onLongPressComment,
  onSectionLayout,
}: LogCommentsProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE);

  // Newest first; render only a bounded window so the count never floods first paint.
  const ordered = useMemo(() => [...comments].reverse(), [comments]);
  const shown = useMemo(() => ordered.slice(0, visibleCount), [ordered, visibleCount]);
  const remaining = ordered.length - shown.length;

  return (
    <SectionErrorBoundary fallbackMessage="Critiques could not be loaded.">
      <View style={s.commentsSection} onLayout={(e) => onSectionLayout?.(e.nativeEvent.layout.y)}>
        <SectionDivider label={`CRITIQUES (${commentTotal ?? comments.length})`} />

        {/* Compose at the top — file a critique, watch it appear right beneath. */}
        <View style={s.composeWrap}>
          <TextInput
            ref={critiqueInputRef}
            style={s.critiqueInput}
            placeholder="File an enduring critique…"
            placeholderTextColor={colors.fog}
            value={newComment}
            onChangeText={onNewCommentChange}
            multiline
            maxLength={500}
            selectionColor={'rgba(218,165,32,0.3)'}
            cursorColor={colors.sepia}
            disableFullscreenUI={true}
            keyboardAppearance="dark"
            accessibilityLabel="Write a critique on this log"
          />
          <PressableScale
            style={[s.critiqueSubmitBtn, !newComment.trim() && s.critiqueSubmitDisabled]}
            onPress={onPostComment}
            disabled={!newComment.trim() || posting}
            hitSlop={HITSLOP}
            pressedScale={0.95}
            haptic="medium"
          >
            <Text style={s.critiqueSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{posting ? 'FILING…' : 'FILE CRITIQUE'}</Text>
            <Sparkles size={10} color={colors.ink} strokeWidth={1.5} />
          </PressableScale>
        </View>

        {comments.length === 0 ? (
          <Text style={s.emptyComments}>No critiques yet. Leave a mark on this record.</Text>
        ) : (
          <>
            <View style={s.listDivider} />
            {shown.map((c: LogComment) => (
              <CommentRow
                key={c.id}
                c={c}
                currentUserId={currentUserId}
                onDelete={onDeleteComment}
                onPressUser={onPressUser}
                onLongPress={onLongPressComment}
              />
            ))}
            {remaining > 0 && (
              <PressableScale
                style={s.showMoreBtn}
                onPress={() => setVisibleCount((v) => v + PAGE)}
                hitSlop={HITSLOP}
                pressedScale={0.97}
                haptic="selection"
                accessibilityLabel={`Show ${remaining} more critiques`}
              >
                <Text style={s.showMoreText}>SHOW MORE CRITIQUES · {remaining} MORE</Text>
                <ChevronDown size={12} color={colors.sepia} strokeWidth={2} />
              </PressableScale>
            )}
          </>
        )}
      </View>
    </SectionErrorBoundary>
  );
}
