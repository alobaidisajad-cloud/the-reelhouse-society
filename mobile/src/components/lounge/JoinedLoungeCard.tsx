/**
 * JoinedLoungeCard — one of YOUR SALONS on the rail: its cover, clean (no words on a picture), and
 * beneath it its name, when the last word was said, one piece of news, and who sits there. The
 * news is one tag, in the house's order: AWAITING while the host considers you, then the requests
 * at your door, then what is new. Nothing pulses.
 */
import React from 'react';
import { RemoteImage } from '@/src/components/Picture';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { nav } from '@/src/utils/typedRouter';
import { Film as FilmIcon, DoorOpen, Hourglass, Lock } from 'lucide-react-native';
import { LoungeRoom } from '@/src/stores/lounge';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { tmdb } from '@/src/lib/tmdb';
import PressableScale from '@/src/components/PressableScale';
import { MemberFaceStack } from '@/src/components/lounge/MemberFaceStack';
import { UNSPOKEN } from '@/src/components/dispatch/paper/paperMetrics';
import { useTimeAgo } from '@/src/hooks/useClock';
import { useLineScale } from '@/src/hooks/useTextScale';
import { CORRIDOR } from './corridor';

/** Where the server stops counting a salon's unread dispatches. */
export const UNREAD_COUNTED_TO = 100;

/** The name's two lines, at the phone's display size: every card on the rail stands as tall. */
const NAME = { size: 15, line: 18 } as const;

export const JoinedLoungeCard = React.memo(({ lounge, width }: { lounge: LoungeRoom; width: number }) => {
  const coverUrl = lounge.cover_image ? tmdb.backdrop(lounge.cover_image, 'w500') : null;
  const unread = lounge.unread_count ?? 0;
  const isAwaiting = lounge.membership_status === 'pending';
  const atDoor = lounge.pending_count || 0;
  const lastWord = useTimeAgo(lounge.last_message_at ?? null);
  const nameRoom = { minHeight: NAME.line * 2 * useLineScale() };
  // get_lounge_unread_counts stops counting at UNREAD_COUNTED_TO, so a count there means at least that.
  const unreadSpoken = unread >= UNREAD_COUNTED_TO ? `more than ${UNREAD_COUNTED_TO - 1}` : `${unread}`;
  const members = lounge.member_count || 0;
  const news = isAwaiting ? 'awaiting the host'
    : atDoor > 0 ? `${atDoor} at your door`
      : unread > 0 ? `${unreadSpoken} new dispatches` : null;

  return (
    <PressableScale style={[s.card, { width }]} onPress={() => nav.push(`/lounge/${lounge.id}`)} haptic="light" hitSlop={null}
      accessibilityRole="button"
      // Everything the card draws, said: the name, its privacy, the last word, the news, the seats.
      accessibilityLabel={[`Enter salon ${lounge.name}`, lounge.is_private ? 'private' : null,
        lastWord ? `last word ${lastWord.toLowerCase()}` : null, news,
        `${members} ${members === 1 ? 'member' : 'members'}`].filter(Boolean).join(', ')}>
      <View style={s.cover}>
        <RemoteImage uri={coverUrl} style={StyleSheet.absoluteFill} contentFit="cover" placeholder={{ blurhash: SEPIA_HASH }} transition={300}
          fallback={<View style={s.noCover}><FilmIcon size={22} color={colors.tarnishDeep} strokeWidth={1.5} /></View>} />
      </View>
      <View style={s.body} {...UNSPOKEN}>
        <View style={[s.nameRow, nameRoom]}>
          {lounge.is_private ? <Lock size={12} color={colors.bone} style={s.lock} /> : null}
          {/* A salon's name is content: past two lines it ends in "…", said whole and shown whole in the room. */}
          <Text style={s.name} {...displayTextProps} numberOfLines={2}>{lounge.name}</Text>
        </View>
        {lastWord ? <Text style={s.lastWord} {...scaledTextProps}>LAST WORD {lastWord.toUpperCase()}</Text> : null}
        <View style={s.newsRoom}>
          {isAwaiting ? (
            <View style={[s.tag, s.tagAwaiting]}>
              <Hourglass size={11} color={colors.bone} />
              <Text style={[s.tagWord, s.tagWordAwaiting]} {...scaledTextProps}>AWAITING</Text>
            </View>
          ) : atDoor > 0 ? (
            <View style={[s.tag, s.tagDoor]}>
              <DoorOpen size={11} color={colors.ink} />
              <Text style={[s.tagWord, s.tagWordDoor]} {...scaledTextProps}>{`${atDoor} AT THE DOOR`}</Text>
            </View>
          ) : unread > 0 ? (
            <View style={[s.tag, s.tagNew]}>
              {/* 9+ past nine: the card's name says the whole count. */}
              <Text style={[s.tagWord, s.tagWordNew]} {...scaledTextProps}>{`${unread > 9 ? '9+' : unread} NEW`}</Text>
            </View>
          ) : null}
        </View>
        <View style={s.faces}><MemberFaceStack faces={lounge.memberFaces} totalCount={members} /></View>
      </View>
    </PressableScale>
  );
});
JoinedLoungeCard.displayName = 'JoinedLoungeCard';

const s = StyleSheet.create({
  card: { backgroundColor: colors.soot, borderRadius: CORRIDOR.radius, overflow: 'hidden' },
  cover: { aspectRatio: 16 / 10, backgroundColor: colors.inkwell },
  noCover: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, paddingTop: 10, paddingHorizontal: 11, paddingBottom: 11, gap: 6 },
  nameRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  lock: { marginTop: 3 },
  name: { flex: 1, minWidth: 0, fontFamily: fonts.display, fontSize: NAME.size, lineHeight: NAME.line, color: colors.silverScreen },
  lastWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.2, color: colors.fog, includeFontPadding: false },
  newsRoom: { minHeight: 22, flexDirection: 'row' },
  // At the card's foot, however long its name: the cards on a rail stand as tall as the tallest.
  faces: { marginTop: 'auto' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 5, minHeight: 22, paddingHorizontal: 7, paddingTop: 2, paddingBottom: 1, borderRadius: 3 },
  tagNew: { backgroundColor: colors.crimson },
  tagDoor: { backgroundColor: colors.sepia },
  tagAwaiting: { borderWidth: 1, borderColor: 'rgba(194,180,146,0.5)' },
  tagWord: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.4, includeFontPadding: false },
  tagWordNew: { color: colors.flicker },
  tagWordDoor: { color: colors.ink },
  tagWordAwaiting: { color: colors.bone },
});
