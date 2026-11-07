
import { PageSection } from '@/src/components/log/PageSection';
import { SectionErrorBoundary } from '@/src/components/SectionErrorBoundary';
import PressableScale from '@/src/components/PressableScale';
import { formatCount, UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { scaledTextProps } from '@/src/constants/textScaling';
import { colors, fonts } from '@/src/theme/theme';
import { UNREADY } from '@/src/theme/unready';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';
import { ChevronDown } from 'lucide-react-native';
import React, { RefObject, useMemo, useState } from 'react';
import { View, StyleSheet } from 'react-native';
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
  /** The record was drawn from its card and its critiques are on their way: never "No critiques yet" before the house answers. */
  reading?: boolean;
  /**
   * Ask the house for the next older page. The list holds the newest page of a
   * thread; once SHOW MORE has shown all it holds, it asks for more with this.
   */
  onLoadOlder?: () => void;
  /** An older page is on its way. */
  loadingOlder?: boolean;
  onReread?: () => void;
  onSectionLayout?: (y: number) => void;
  /** A reader not signed in is asked for a name where the field would be. */
  onSignIn?: () => void;
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
  reading = false,
  onReread,
  onLoadOlder,
  loadingOlder = false,
  onSignIn,
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
      {/* No count for none: `CRITIQUES · 0` is a number about nobody, and
          every count in the house is hidden at zero. */}
      <PageSection title={formatCount(commentTotal ?? comments.length) ? `CRITIQUES · ${formatCount(commentTotal ?? comments.length)}` : 'CRITIQUES'} onLayout={onSectionLayout}>

        {/* Whenever the read failed: what is below is only what this phone
            wrote and has not sent, if anything. */}
        {unread ? (
          <View style={st.unread}>
            <Text style={st.margin} {...scaledTextProps}>The critiques could not be reached.</Text>
            {onReread ? <TryAgainLine onPress={onReread} what="read the critiques" /> : null}
          </View>
        ) : null}
        {comments.length === 0 ? (
          unread || reading ? null : <Text style={st.margin} {...scaledTextProps}>No critiques yet. Leave a mark on this record.</Text>
        ) : (
          <>
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
                style={st.more}
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
                <Text style={st.moreText}>{loadingOlder ? 'READING EARLIER CRITIQUES…' : `SHOW MORE CRITIQUES · ${hidden} MORE`}</Text>
                <ChevronDown size={12} color={colors.sepia} strokeWidth={2} />
              </PressableScale>
            )}
          </>
        )}

        {/* The field after what was said, as a margin's last line: a reader not signed in is asked first. */}
        {onSignIn ? (
          <>
            <View style={st.ask}><Text style={st.askText} {...scaledTextProps}>Sign in to file a critique.</Text></View>
            <PressableScale style={st.file} onPress={onSignIn} hitSlop={null} pressedScale={0.97} haptic="selection" accessibilityRole="button" accessibilityLabel="Sign in to file a critique">
              <Text style={st.fileText} {...scaledTextProps}>SIGN IN</Text>
            </PressableScale>
          </>
        ) : (
        <>
          <TextInput
            ref={critiqueInputRef}
            style={st.field}
            placeholder="File an enduring critique…"
            placeholderTextColor={colors.fog}
            value={newComment}
            onChangeText={onNewCommentChange}
            multiline
            maxLength={MAX_LENGTHS.logComment}
            // Its lines are a set 19pt. Uncapped, a member writing at the
            // largest accessibility size types into clipped lines.
            {...scaledTextProps}
            selectionColor={'rgba(220,166,58,0.3)'}
            cursorColor={colors.sepia}
            disableFullscreenUI={true}
            keyboardAppearance="dark"
            accessibilityLabel="Write a critique on this log"
          />
          <PressableScale
            style={[st.file, !newComment.trim() && UNREADY.plate]}
            onPress={onPostComment}
            disabled={!newComment.trim() || posting}
            hitSlop={null}
            pressedScale={0.97}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel={posting ? 'Filing the critique' : 'File critique'}
          >
            {posting ? null : <Text style={[st.fileText, !newComment.trim() && UNREADY.words]} {...UNSPOKEN}>✦</Text>}
            <Text style={[st.fileText, !newComment.trim() && UNREADY.words]} {...scaledTextProps}>{posting ? 'FILING…' : 'FILE CRITIQUE'}</Text>
          </PressableScale>
        </>
        )}
      </PageSection>
    </SectionErrorBoundary>
  );
}

const st = StyleSheet.create({
  margin: { marginTop: 12, fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.fog },
  unread: { gap: 4 },
  more: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'center', marginTop: 16,
    minHeight: 44, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 3,
  },
  moreText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.3, color: colors.sepia, includeFontPadding: false },
  // The field: the house's well, its brass edge.
  field: {
    marginTop: 18, minHeight: 66, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 12,
    backgroundColor: colors.well, borderWidth: 1, borderColor: colors.fieldEdge, borderRadius: 3,
    fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.parchment, textAlignVertical: 'top',
  },
  file: { marginTop: 10, minHeight: 48, borderWidth: 1, borderColor: colors.sepia, borderRadius: 3, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  fileText: { fontFamily: fonts.sub, fontSize: 11, letterSpacing: 3, color: colors.sepia, includeFontPadding: false, textAlign: 'center' },
  ask: { marginTop: 18, padding: 16, backgroundColor: colors.well, borderRadius: 3 },
  askText: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 19, color: colors.bone, textAlign: 'center' },
});
