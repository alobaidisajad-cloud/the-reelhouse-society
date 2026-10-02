
import { s } from '@/src/components/log/logDetailStyles';
import { SectionDivider } from '@/src/components/Decorative';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import PressableScale from '@/src/components/PressableScale';
import { formatCount } from '@/src/components/dispatch/paper/paperMetrics';
import { scaledTextProps } from '@/src/constants/textScaling';
import { colors } from '@/src/theme/theme';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { Sparkles, ChevronDown } from 'lucide-react-native';
import React, { RefObject, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { CritiqueRow, type Critique } from '@/src/components/critique/CritiqueRow';
import { TryAgainLine } from '@/src/components/TryAgain';

type LogComment = Critique;

const PAGE = 12;
const HITSLOP = { top: 15, bottom: 15, left: 15, right: 15 } as const;

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
  /** After the member has said yes: CritiqueRow asks first. */
  onWithdrawComment: (id: string) => void;
  onPressUser: (username: string) => void;
  /** Another member's critique, to the report sheet; absent for a reader not signed in. */
  onReportComment?: (comment: LogComment & { user_id: string }) => void;
  /** The critiques could not be read: say so, not "No critiques yet". */
  unread?: boolean;
  /**
   * Ask the house for the next older page. The list holds the newest page of a
   * thread; once SHOW MORE has shown all it holds, it asks for more with this.
   */
  onLoadOlder?: () => void;
  /** An older page is on its way. */
  loadingOlder?: boolean;
  onReread?: () => void;
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
  onWithdrawComment,
  onPressUser,
  onReportComment,
  onSectionLayout,
  unread = false,
  onReread,
  onLoadOlder,
  loadingOlder = false,
}: LogCommentsProps) {
  const [visibleCount, setVisibleCount] = useState(PAGE);

  // Newest first; render only a bounded window so the count never floods first paint.
  const ordered = useMemo(() => [...comments].reverse(), [comments]);
  const shown = useMemo(() => ordered.slice(0, visibleCount), [ordered, visibleCount]);
  const remaining = ordered.length - shown.length;
  // What the house holds beyond the page this list has: asked for only through
  // onLoadOlder, so without it nothing is offered that cannot be fetched.
  const unfetched = onLoadOlder ? Math.max(0, (commentTotal ?? comments.length) - comments.length) : 0;
  const hidden = remaining + unfetched;

  return (
    <SectionErrorBoundary fallbackMessage="Critiques could not be loaded.">
      <View style={s.commentsSection} onLayout={(e) => onSectionLayout?.(e.nativeEvent.layout.y)}>
        {/* No count for none: `CRITIQUES (0)` is a number about nobody, and
            every count in the house is hidden at zero. */}
        <SectionDivider label={formatCount(commentTotal ?? comments.length) ? `CRITIQUES (${formatCount(commentTotal ?? comments.length)})` : 'CRITIQUES'} />

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
            maxLength={MAX_LENGTHS.logComment}
            // The box below it is a fixed 22pt line. Uncapped, a member writing
            // at the largest accessibility size types into clipped lines.
            {...scaledTextProps}
            selectionColor={'rgba(220,166,58,0.3)'}
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

        {/* Whenever the read failed: what is below is only what this phone
            wrote and has not sent, if anything. */}
        {unread ? (
          <View style={s.critiquesUnread}>
            <Text style={s.emptyComments}>The critiques could not be reached.</Text>
            {onReread ? <TryAgainLine onPress={onReread} accessibilityLabel="Read the critiques again" /> : null}
          </View>
        ) : null}
        {comments.length === 0 ? (
          unread ? null : <Text style={s.emptyComments}>No critiques yet. Leave a mark on this record.</Text>
        ) : (
          <>
            <View style={s.listDivider} />
            {shown.map((c: LogComment) => (
              <CritiqueRow
                key={c.id}
                c={c}
                currentUserId={currentUserId}
                onWithdraw={onWithdrawComment}
                onPressUser={onPressUser}
                onReport={onReportComment}
              />
            ))}
            {hidden > 0 && (
              <PressableScale
                style={s.showMoreBtn}
                onPress={() => {
                  setVisibleCount((v) => v + PAGE);
                  // What is held runs out with this press: the next older page.
                  if (remaining <= PAGE && unfetched > 0) onLoadOlder?.();
                }}
                disabled={loadingOlder}
                hitSlop={HITSLOP}
                pressedScale={0.97}
                haptic="selection"
                accessibilityLabel={loadingOlder ? 'Reading earlier critiques' : `Show ${hidden} more critiques`}
              >
                <Text style={s.showMoreText}>{loadingOlder ? 'READING EARLIER CRITIQUES…' : `SHOW MORE CRITIQUES · ${hidden} MORE`}</Text>
                <ChevronDown size={12} color={colors.sepia} strokeWidth={2} />
              </PressableScale>
            )}
          </>
        )}
      </View>
    </SectionErrorBoundary>
  );
}
