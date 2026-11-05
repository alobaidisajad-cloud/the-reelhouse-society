/**
 * The directory of ALL SALONS: one framed sheet (the house's soot, a brass rule just inside its
 * edge), its head, a row per salon and its foot. A row: the salon's cover when it has one, its
 * name and when the last word was said, two lines of what it is, its members, PRIVATE, and the
 * verb true to the viewer's rank: TAKE A SEAT and REQUEST A SEAT for a rank that takes one;
 * LISTEN IN, and BY REQUEST with the key, for one that does not yet. Long-press reports a salon
 * (also a named action, for a screen reader).
 */
import React from 'react';
import { RemoteImage } from '@/src/components/Picture';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import { Users, KeyRound, ChevronRight } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { counted } from '@/src/utils/counted';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useTimeAgo } from '@/src/hooks/useClock';
import { useTextScale } from '@/src/hooks/useTextScale';
import { useColumnWidth } from '@/src/components/layout/navMetrics';
import { lineWidth } from '@/src/components/lobby/measure';
import { CORRIDOR } from './corridor';
import { saidStruck, useStruck } from '@/src/components/StruckWords';

/** A row's measures: its sides inside the frame, the cover, the gaps, the name and its last word. */
const ROW = { pad: 20, thumb: 52, gap: 12, beside: 10, name: 17, time: 10, timeSpacing: 1.2 } as const;

/** The verb a row says, by the salon's door and the viewer's rank. */
export function verbFor(isPrivate: boolean, seated: boolean): Verb {
  if (isPrivate) return seated ? 'REQUEST A SEAT' : 'BY REQUEST';
  return seated ? 'TAKE A SEAT' : 'LISTEN IN';
}

type Verb = 'REQUEST A SEAT' | 'BY REQUEST' | 'TAKE A SEAT' | 'LISTEN IN';

/** Each verb as it is said: the words it shows, first. */
const SAID: Record<Verb, string> = {
  'REQUEST A SEAT': 'Request a seat', 'BY REQUEST': 'By request', 'TAKE A SEAT': 'Take a seat', 'LISTEN IN': 'Listen in',
};

/** The directory's head: its name and what it holds, inside the top of its frame. */
export const DirectoryHead = React.memo(function DirectoryHead() {
  return (
    <View style={s.head}>
      <View style={[s.rule, s.ruleTop]} pointerEvents="none" />
      <Text style={s.headWord} {...scaledTextProps} accessibilityRole="header">ALL SALONS</Text>
      <Text style={s.headLine} {...scaledTextProps}>Public discourse and private gatherings. Take a seat.</Text>
    </View>
  );
});

/** The frame's rule down both sides of a row (a salon's, or one still while they are read). */
export const FrameSides = React.memo(function FrameSides() {
  return <View style={[s.rule, s.ruleSides]} pointerEvents="none" {...UNSPOKEN} />;
});

/** The directory's foot, closing its frame. */
export const DirectoryFoot = React.memo(function DirectoryFoot() {
  return (
    <View style={s.foot} {...UNSPOKEN}>
      <View style={[s.rule, s.ruleFoot]} pointerEvents="none" />
    </View>
  );
});

export const PublicLoungeCard = React.memo(({ lounge: room, first, seated, onReport }: {
  lounge: LoungeRoom;
  /** The first row: no hairline above it. */
  first: boolean;
  /** The viewer's rank takes a seat: the verb it is offered. */
  seated: boolean;
  onReport?: (lounge: LoungeRoom) => void;
}) => {
  // The room's name and description, each slur struck for a reader who asked (StruckWords).
  const struck = useStruck();
  const lounge = React.useMemo(() => ({ ...room, name: struck(room.name), description: struck(room.description) }), [room, struck]);
  const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w300') : null;
  const lastWord = useTimeAgo(lounge.last_message_at ?? null);
  const verb = verbFor(lounge.is_private, seated);
  const roped = !seated && lounge.is_private;
  const members = counted(lounge.member_count || 0, 'MEMBER', 'MEMBERS');
  // The last word stands beside the name while the name's longest word still fits beside it; else under it.
  const column = useColumnWidth();
  const scale = useTextScale();
  const nameRoom = column - 2 * CORRIDOR.page - 2 * ROW.pad - (coverUrl ? ROW.thumb + ROW.gap : 0);
  const timeRoom = lastWord
    ? ROW.beside + lineWidth(lastWord.toUpperCase(), 'elite', ROW.time, Math.min(scale, scaledTextProps.maxFontSizeMultiplier), ROW.timeSpacing)
    : 0;
  const longest = Math.max(0, ...lounge.name.split(' ').map((w) => lineWidth(w, 'rye', ROW.name, Math.min(scale, displayTextProps.maxFontSizeMultiplier))));
  const timeBeside = longest <= nameRoom - timeRoom;
  const report = onReport ? () => onReport(room) : undefined;

  return (
    <View style={s.room}>
      <FrameSides />
      {/* A row the width of the frame needs no halo: one would reach into the next row. */}
      <PressableScale style={[s.row, !first && s.rowRuled]} hitSlop={null} haptic="light"
        onPress={() => nav.push(`/lounge/${lounge.id}`)} onLongPress={report}
        accessibilityRole="button"
        accessibilityLabel={[`${SAID[verb]}: ${saidStruck(lounge.name)}`,
          lastWord ? `last word ${lastWord.toLowerCase()}` : null,
          saidStruck(lounge.description) || null, members.toLowerCase(), lounge.is_private ? 'private' : null].filter(Boolean).join(', ')}
        accessibilityActions={report ? [{ name: 'report', label: 'Report this salon' }] : undefined}
        onAccessibilityAction={report ? (e) => { if (e.nativeEvent.actionName === 'report') report(); } : undefined}>
        {coverUrl ? (
          <View style={s.thumb}>
            <RemoteImage uri={coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" placeholder={{ blurhash: SEPIA_HASH }} transition={300} fallback={null} />
          </View>
        ) : null}
        <View style={s.words} {...UNSPOKEN}>
          <View style={[s.nameLine, !timeBeside && s.nameLineStacked]}>
            {/* A salon's name is content: past two lines it ends in "…", shown whole in the room. */}
            <Text style={s.name} {...displayTextProps} numberOfLines={2}>{lounge.name}</Text>
            {lastWord ? <Text style={s.lastWord} {...scaledTextProps}>{lastWord.toUpperCase()}</Text> : null}
          </View>
          {lounge.description ? <Text style={s.what} {...scaledTextProps} numberOfLines={2}>{lounge.description}</Text> : null}
          <View style={s.meta}>
            <View style={s.fact}>
              <Users size={12} color={colors.bone} />
              <Text style={s.factWord} {...scaledTextProps}>{members}</Text>
            </View>
            {lounge.is_private ? (
              <View style={s.fact}>
                <KeyRound size={12} color={colors.bone} />
                <Text style={s.factWord} {...scaledTextProps}>PRIVATE</Text>
              </View>
            ) : null}
            <View style={s.verb}>
              {roped ? <KeyRound size={13} color={colors.bone} /> : null}
              <Text style={[s.verbWord, roped && s.verbWordRoped]} {...scaledTextProps}>{verb}</Text>
              {roped ? null : <ChevronRight size={13} color={colors.sepia} />}
            </View>
          </View>
        </View>
      </PressableScale>
    </View>
  );
});
PublicLoungeCard.displayName = 'PublicLoungeCard';

const RULE = 'rgba(184,137,26,0.26)';

const s = StyleSheet.create({
  // The frame's rule, inside its edge: the head draws its top, each row its sides, the foot its foot.
  rule: { position: 'absolute', left: CORRIDOR.rule, right: CORRIDOR.rule, borderColor: RULE },
  ruleTop: { top: CORRIDOR.rule, bottom: 0, borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderTopLeftRadius: 5, borderTopRightRadius: 5 },
  ruleSides: { top: 0, bottom: 0, borderLeftWidth: 1, borderRightWidth: 1 },
  ruleFoot: { top: 0, height: CORRIDOR.rule, borderLeftWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  head: {
    marginTop: 26, backgroundColor: colors.soot, borderTopLeftRadius: CORRIDOR.radius, borderTopRightRadius: CORRIDOR.radius,
    alignItems: 'center', paddingTop: 18, paddingHorizontal: 20, paddingBottom: 6,
  },
  headWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 4, color: colors.sepia, includeFontPadding: false },
  headLine: { fontFamily: fonts.bodyItalic, fontSize: 12, lineHeight: 17, color: colors.bone, textAlign: 'center', marginTop: 5 },
  foot: { height: CORRIDOR.rule * 2, backgroundColor: colors.soot, borderBottomLeftRadius: CORRIDOR.radius, borderBottomRightRadius: CORRIDOR.radius },
  room: { backgroundColor: colors.soot },
  row: { flexDirection: 'row', gap: ROW.gap, paddingVertical: 14, paddingHorizontal: ROW.pad },
  rowRuled: { borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: 'rgba(232,223,208,0.08)', marginHorizontal: ROW.pad, paddingHorizontal: 0 },
  thumb: { width: ROW.thumb, height: ROW.thumb, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.inkwell },
  words: { flex: 1, minWidth: 0 },
  nameLine: { flexDirection: 'row', alignItems: 'flex-start', gap: ROW.beside },
  nameLineStacked: { flexDirection: 'column', gap: 2 },
  name: { flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: ROW.name, lineHeight: 21, color: colors.silverScreen },
  lastWord: { marginTop: 4, fontFamily: fonts.sub, fontSize: ROW.time, letterSpacing: ROW.timeSpacing, color: colors.fog, includeFontPadding: false },
  what: { fontFamily: fonts.bodyItalic, fontSize: 13, lineHeight: 18, color: colors.bone, marginTop: 3 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 4, marginTop: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  factWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, color: colors.bone, includeFontPadding: false },
  verb: { marginLeft: 'auto', minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 4 },
  verbWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
  verbWordRoped: { color: colors.bone },
});
