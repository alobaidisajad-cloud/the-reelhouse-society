 
import { s } from '@/app/log/_logDetailStyles';
import { SectionDivider } from '@/src/components/Decorative';
import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import TactileEngine from '@/src/utils/TactileEngine';
import { Sparkles } from 'lucide-react-native';
import React, { RefObject } from 'react';
import { Text, TextInput, View } from 'react-native';

interface LogComment {
  id: string;
  user_id: string;
  username: string;
  body: string;
  created_at: string;
}

// ── Memoized Comment Row ──
 
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
    accessibilityLabel={`Comment by ${c.username}`}
    accessibilityHint={c.user_id !== currentUserId ? "Long press to report or block" : undefined}
  >
    <View style={s.commentItem}>
      <View style={s.userInfoRow}>
        <PressableScale style={s.shrinkable} onPress={() => onPressUser(c.username)} pressedScale={0.95} haptic="selection">
          <Text style={s.commUsername} numberOfLines={1}>@{c.username}</Text>
        </PressableScale>
        <Text style={s.commDate}>{new Date(c.created_at).toLocaleDateString()}</Text>
      </View>
      <Text style={s.commBody} selectable>{c.body}</Text>
      {currentUserId === c.user_id && (
        <PressableScale 
          onPress={() => onDelete(c.id)} 
          style={s.commDeleteBtn} 
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} 
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
  currentUserId?: string;
  newComment: string;
  posting: boolean;
  critiqueInputRef: RefObject<TextInput>;
  onNewCommentChange: (text: string) => void;
  onPostComment: () => void;
  onDeleteComment: (id: string) => void;
  onPressUser: (username: string) => void;
  onLongPressComment?: (comment: LogComment) => void;
}

export default function LogComments({
  comments,
  currentUserId,
  newComment,
  posting,
  critiqueInputRef,
  onNewCommentChange,
  onPostComment,
  onDeleteComment,
  onPressUser,
  onLongPressComment,
}: LogCommentsProps) {
  return (
    <View style={s.commentsSection}>
      <SectionDivider label={`CRITIQUES (${comments.length})`} />
      
      {comments.map((c: LogComment) => (
         <CommentRow 
           key={c.id} 
           c={c} 
           currentUserId={currentUserId} 
           onDelete={onDeleteComment} 
           onPressUser={onPressUser}
           onLongPress={onLongPressComment}
         />
      ))}

      {comments.length === 0 && (
         <Text style={s.emptyComments}>No critiques yet. Leave a mark on this record.</Text>
      )}

      {/* Inline Critique Input — Web: AnnotationPanel style */}
      <View style={s.critiqueInputWrap}>
        <TextInput
          ref={critiqueInputRef}
          style={s.critiqueInput}
          placeholder="File an enduring critique..."
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
          hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
          pressedScale={0.95}
          haptic="medium"
        >
          <Text style={s.critiqueSubmitText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{posting ? 'FILING...' : 'SUBMIT CRITIQUE'}</Text>
          <Sparkles size={10} color={colors.ink} strokeWidth={1.5} />
        </PressableScale>
      </View>
    </View>
  );
}
