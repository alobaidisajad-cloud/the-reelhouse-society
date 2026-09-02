import { memo } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { ArrowLeft, ChevronUp, Heart, MessageSquare, Share2, Bookmark } from 'lucide-react-native';

import PressableScale from '@/src/components/PressableScale';
import { colors } from '@/src/theme/theme';
import { scaledTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { p } from './paperStyles';
import { formatCount, COMMENT_PAGE_SIZE, actionLabelProps, CRIMSON_INK, UNSPOKEN } from './paperMetrics';
import { softBreak } from './paperText';
import { isRTLText } from '@/src/utils/text';
import { Byline, Credit, type PaperAuthor, type PaperFilm } from './PaperPost';

export interface Critique {
  id: string;
  author: PaperAuthor | null;
  body: string;
  certifyCount: number;
  certified?: boolean;
  age: string;
  film?: PaperFilm | null;   // an answer, on a seeking post
  mine?: boolean;
  taken?: boolean;
}

/**
 * ── A POST WITH THOUSANDS OF CRITIQUES ───────────────────────────────────────
 * The five decisions that make this survivable, and the reasoning for each:
 *
 *  1. FLAT. No threading, at any depth. A tree of replies is Reddit's shape and
 *     it collapses on a 300pt measure — by the third indent a comment has forty
 *     points of room. THE REPLY already elevates the one response that matters,
 *     chosen by the house rather than by whoever replied first, so the job
 *     nesting normally does is already done, better.
 *
 *  2. THE SPINE. Once the post scrolls away you are reading five thousand
 *     opinions about something you can no longer see. A single line pins to the
 *     top carrying the kind and the post's opening words; tapping it returns
 *     you to the top. It is the one piece of chrome this page adds, and it only
 *     exists while it is needed.
 *
 *  3. TWO ORDERS. NEWEST and CERTIFIED. Ordering by certifies is served by the
 *     `(post_id, certify_count DESC)` index that also answers THE REPLY, so it
 *     costs nothing extra.
 *
 *  4. THIRTY AT A TIME, and nobody ever reaches the end of five thousand. That
 *     is correct behaviour, not a failure — so the footer says how many remain
 *     rather than pretending an end is near.
 *
 *  5. YOUR OWN LANDS AT THE TOP, marked, the instant you file it — and if the
 *     write fails it stays on screen carrying the failure. A comment that
 *     silently vanishes is the worst thing a discussion page can do.
 */
/**
 * ── ONE BAR, NOT TWO ─────────────────────────────────────────────────────────
 * This screen used to carry a header saying `← TAKE` and, forty points beneath
 * it, a spine saying `TAKE — Stalker is not slow…`. The same word, in the same
 * brass, twice, in two bands doing one job.
 *
 * There is one bar. The arrow leaves the screen and the rest of the bar returns
 * you to the post — two actions, so two targets, divided by a hairline rather
 * than by a whole second row. And the opening is passed WHOLE: it is cut by
 * `numberOfLines`, so it is right at every text size and in every language,
 * where a string cut in advance is only ever right at one.
 */
export const CritiqueSpine = memo(function CritiqueSpine({
  kind, opening, count, onTop, onBack,
}: { kind: string; opening: string; count: number; onTop?: () => void; onBack?: () => void }) {
  return (
    <View style={p.spine}>
      <PressableScale
        style={p.spineBack} onPress={onBack} haptic="selection"
        hitSlop={{ top: 8, bottom: 8, left: 6, right: 0 }}
        accessibilityRole="button" accessibilityLabel="Back"
      >
        <ArrowLeft size={15} strokeWidth={2} color={colors.sepia} />
      </PressableScale>
      <PressableScale
        style={p.spineBody} onPress={onTop} haptic="selection"
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel={`Back to the top of the ${kind.toLowerCase()}. ${count} critiques.`}
      >
        <ChevronUp size={13} strokeWidth={2} color={colors.sepia} />
        <Text style={p.spineKind} {...decorativeTextProps}>{kind.toUpperCase()}</Text>
        <Text style={p.spineText} numberOfLines={1} {...scaledTextProps}>{opening}</Text>
        <Text style={p.spineCount} {...scaledTextProps}>{formatCount(count) ?? ''}</Text>
      </PressableScale>
    </View>
  );
});

export const CritiqueHead = memo(function CritiqueHead({
  count, order, onOrder,
}: { count: number; order: 'NEWEST' | 'CERTIFIED'; onOrder?: (o: 'NEWEST' | 'CERTIFIED') => void }) {
  const n = formatCount(count);
  return (
    <View style={p.critiqueHead}>
      <Text style={p.critiqueLabel} accessibilityRole="header" {...decorativeTextProps}>
        CRITIQUES{n ? ` · ${n}` : ''}
      </Text>
      <View style={p.critiqueSortRow}>
        {(['NEWEST', 'CERTIFIED'] as const).map((o) => (
          <PressableScale
            key={o} onPress={() => onOrder?.(o)} haptic="selection"
            hitSlop={{ top: 10, bottom: 10, left: 0, right: 0 }}
            accessibilityRole="button"
            accessibilityState={{ selected: o === order }}
            accessibilityLabel={`Order by ${o.toLowerCase()}`}
          >
            <Text style={[p.critiqueSort, o === order && p.critiqueSortOn]} {...scaledTextProps}>{o}</Text>
          </PressableScale>
        ))}
      </View>
    </View>
  );
});

/**
 * One critique. On a seeking post it carries the film it recommends, and the
 * member who asked — and only they — sees TAKE THIS ONE. You cannot take your
 * own answer; the control is absent here and the function refuses it too, so
 * hiding a button is never the only thing standing in the way.
 */
export const CritiqueRow = memo(function CritiqueRow({
  c, canTake, top,
}: { c: Critique; canTake?: boolean; top?: boolean }) {
  const n = formatCount(c.certifyCount);
  return (
    <View style={[p.comment, c.mine && p.commentMine]}>
      <View style={p.avatar}>
        {c.author && c.author.avatar ? (
          <Image source={{ uri: c.author.avatar }} style={p.plateArt} contentFit="cover" />
        ) : c.author ? (
          <Text style={p.avatarNo} {...decorativeTextProps}>{c.author.memberNo}</Text>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={p.commentName} numberOfLines={1} {...scaledTextProps}>
          {c.author ? `${c.author.name.toUpperCase()} · No. ${c.author.memberNo}` : 'A MEMBER, DEPARTED'}
          {c.mine ? '  ·  YOU' : ''}
          {/* What THE REPLY was for, without inventing a second object: ordered
              by certifies, the strongest answer is simply first, and says so. */}
          {top ? <Text style={p.topMark}>{'  ·  MOST CERTIFIED'}</Text> : null}
        </Text>

        {c.film ? (
          <View style={{ marginBottom: 8 }}>
            <Credit film={c.film} />
          </View>
        ) : null}

        <Text style={[p.commentBody, isRTLText(c.body) && p.rtlText]} {...scaledTextProps}>{softBreak(c.body)}</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <PressableScale
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 8, paddingHorizontal: 8, marginLeft: -8 }}
            hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }} haptic
            accessibilityRole="button"
            accessibilityLabel={c.certified ? 'Certified' : 'Certify this critique'}
          >
            <Heart size={12} strokeWidth={2}
              color={c.certified ? colors.crimson : colors.fog}
              fill={c.certified ? colors.crimson : 'transparent'} />
            <Text style={[p.commentMeta, { marginTop: 0 }, c.certified && { color: CRIMSON_INK }]} {...scaledTextProps}>
              {n ?? ''}
            </Text>
          </PressableScale>
          <Text style={[p.commentMeta, { marginTop: 0 }]} {...scaledTextProps}>{c.age}</Text>
          {canTake && !c.mine ? (
            <PressableScale
              style={{ paddingVertical: 8 }} hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }} haptic="medium"
              accessibilityRole="button" accessibilityLabel={`Take ${c.film?.title} as your answer`}
            >
              <Text style={[p.commentMeta, { marginTop: 0, color: colors.sepia, letterSpacing: 1.6 }]} {...scaledTextProps}>
                TAKE THIS ONE
              </Text>
            </PressableScale>
          ) : null}
        </View>
      </View>
    </View>
  );
});

/**
 * The footer of a very long thread. It never claims an end is near — with five
 * thousand critiques it says what remains, which is honest and stops the member
 * scrolling in hope.
 */
export const CritiqueFooter = memo(function CritiqueFooter({
  shown, total, loading,
}: { shown: number; total: number; loading?: boolean }) {
  const left = Math.max(0, total - shown);
  if (loading) {
    return (
      <View style={{ paddingVertical: 16, alignItems: 'center' }}>
        <ActivityIndicator size="small" color={colors.sepia} />
      </View>
    );
  }
  if (left <= 0) {
    return (
      <View style={p.endRow}>
        <View style={p.endLine} />
        <Text style={{ color: colors.sepia, fontSize: 12.5, opacity: 0.7 }} {...UNSPOKEN} {...decorativeTextProps}>✦</Text>
        <View style={p.endLine} />
      </View>
    );
  }
  return (
    <View style={{ paddingVertical: 16, alignItems: 'center' }}>
      <Text style={p.ballotFoot} {...scaledTextProps}>
        {formatCount(left)} MORE · {COMMENT_PAGE_SIZE} AT A TIME
      </Text>
    </View>
  );
});

/** One docked thing, ever — this REPLACES the action bar rather than stacking. */
export const CritiqueComposer = memo(function CritiqueComposer({
  me, placeholder = 'Say what you think…', bottomInset = 26,
}: { me: PaperAuthor; placeholder?: string; bottomInset?: number }) {
  return (
    <View style={[p.dockCompose, { paddingBottom: bottomInset }]}>
      <View style={p.avatar}>
        {me.avatar ? (
          <Image source={{ uri: me.avatar }} style={p.plateArt} contentFit="cover" />
        ) : <Text style={p.avatarNo} {...decorativeTextProps}>{me.memberNo}</Text>}
      </View>
      <Text style={p.dockInput} numberOfLines={1} {...scaledTextProps}>{placeholder}</Text>
      <PressableScale
        style={[p.btn, { paddingVertical: 8, paddingHorizontal: 12 }]} haptic="medium"
        hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}
        accessibilityRole="button" accessibilityLabel="File this critique"
      >
        <Text style={p.btnText} {...scaledTextProps}>FILE</Text>
      </PressableScale>
    </View>
  );
});

/** The action bar, docked. Present until the composer takes its place. */
export const PostDock = memo(function PostDock({
  certifyCount, commentCount, certified, saved, bottomInset = 28,
}: {
  certifyCount: number; commentCount: number;
  certified?: boolean; saved?: boolean; bottomInset?: number;
}) {
  const c = formatCount(certifyCount);
  const k = formatCount(commentCount);
  const SLOP = { top: 6, bottom: 6, left: 0, right: 0 };
  return (
    <View style={[p.dock, { paddingBottom: bottomInset }]}>
      <PressableScale style={p.action} hitSlop={SLOP} haptic accessibilityRole="button" accessibilityLabel="Certify">
        <Heart size={15} strokeWidth={2} color={certified ? colors.crimson : colors.fog} fill={certified ? colors.crimson : 'transparent'} />
        <Text style={[p.actionLabel, certified && p.actionLabelOn]} {...actionLabelProps}>
          {certified ? 'CERTIFIED' : 'CERTIFY'}{c ? ` ${c}` : ''}
        </Text>
      </PressableScale>
      <PressableScale style={p.action} hitSlop={SLOP} haptic accessibilityRole="button" accessibilityLabel="Write a critique">
        <MessageSquare size={16} strokeWidth={2} color={colors.fog} />
        <Text style={p.actionLabel} {...actionLabelProps}>CRITIQUE{k ? ` ${k}` : ''}</Text>
      </PressableScale>
      <PressableScale style={p.action} hitSlop={SLOP} haptic accessibilityRole="button" accessibilityLabel="Share">
        <Share2 size={14} strokeWidth={2} color={colors.fog} />
        <Text style={p.actionLabel} {...actionLabelProps}>SHARE</Text>
      </PressableScale>
      <PressableScale style={p.action} hitSlop={SLOP} haptic accessibilityRole="button" accessibilityLabel={saved ? 'Saved' : 'Save'}>
        <Bookmark size={15} strokeWidth={2} color={saved ? colors.sepia : colors.fog} fill={saved ? colors.sepia : 'transparent'} />
        <Text style={[p.actionLabel, saved && p.actionLabelSaved]} {...actionLabelProps}>{saved ? 'SAVED' : 'SAVE'}</Text>
      </PressableScale>
    </View>
  );
});
