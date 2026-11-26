/**
 * HiddenMembersSection — the members one has blocked or muted, each with the way to let them back.
 *
 * UNBLOCK and UNMUTE were offered only on the member's own file, and every road to that file hides
 * them: search, the follower lists and the notices leave them out, and a block ends the follows. A
 * block or a mute stood for good (review round 7). Here they are named, read from the house by the
 * ids the phone holds, and let back one by one; the store lets them back at once and says so.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { EyeOff } from 'lucide-react-native';
import { Text } from '@/src/components/text';
import PressableScale from '@/src/components/PressableScale';
import { RoomRetrieving, RoomUnreachable } from '@/src/components/profile/RoomParts';
import { scaledTextProps } from '@/src/constants/textScaling';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { useBlockStore } from '@/src/stores/blockStore';
import { colors, fonts } from '@/src/theme/theme';
import { SectionCard, SectionHead } from './SettingsSections';

/** One hidden member: by block, or by mute (a block supersedes a mute, so never both). */
type Hidden = { id: string; how: 'block' | 'mute' };

/** Their handles, by id; a member the house no longer holds is absent. */
type Handles = Record<string, string | null>;

async function readHandles(ids: string[]): Promise<Handles> {
  const { data, error } = await supabase.from('profiles').select('id, username').in('id', ids);
  if (error) throw error;
  const out: Handles = {};
  for (const row of (data ?? []) as { id: string; username: string | null }[]) out[row.id] = row.username;
  return out;
}

const ROOM = 'those you have hidden';

export function HiddenMembersSection() {
  const me = useAuthStore((s) => s.user?.id ?? null);
  const blocked = useBlockStore((s) => s.blocked);
  const muted = useBlockStore((s) => s.muted);
  const blocksKnown = useBlockStore((s) => s.blocksKnown);

  // The phone's own list, asked of the house when it was never read (a new phone, a sign-in), and
  // said to be asked from the frame it is wanted: the refusal line never shows before the read.
  const wantsBlocks = !!me && !blocksKnown;
  const [asking, setAsking] = useState(wantsBlocks);
  const [wanted, setWanted] = useState(wantsBlocks);
  if (wanted !== wantsBlocks) {
    setWanted(wantsBlocks);
    if (wantsBlocks) setAsking(true);
  }
  const readBlocks = useCallback(() => {
    if (!me) return;
    void useBlockStore.getState().syncFromServer(me).finally(() => setAsking(false));
  }, [me]);
  useEffect(() => { if (wantsBlocks) readBlocks(); }, [wantsBlocks, readBlocks]);
  const askBlocks = useCallback(() => { setAsking(true); readBlocks(); }, [readBlocks]);

  const hidden = useMemo<Hidden[]>(() => [
    ...blocked.map((id) => ({ id, how: 'block' as const })),
    ...muted.map((id) => ({ id, how: 'mute' as const })),
  ], [blocked, muted]);
  const ids = useMemo(() => hidden.map((h) => h.id).sort(), [hidden]);

  const handles = useQuery({
    queryKey: ['hiddenMembers', me, ids],
    queryFn: () => readHandles(ids),
    enabled: !!me && ids.length > 0,
    // One let back changes the ids: the names already read stay while the rest are read again.
    placeholderData: (before) => before,
  });

  const letBack = useCallback((h: Hidden) => {
    const store = useBlockStore.getState();
    void (h.how === 'block' ? store.unblockUser(h.id) : store.unmuteUser(h.id));
  }, []);

  if (!me) return null;

  let body: React.ReactNode;
  if (!blocksKnown) {
    body = asking ? <RoomRetrieving room={ROOM} /> : <RoomUnreachable room={ROOM} onRetry={askBlocks} />;
  } else if (hidden.length === 0) {
    body = (
      <Text style={s.line} {...scaledTextProps}>
        No one. A member you block or mute is listed here, and let back from here.
      </Text>
    );
  } else if (!handles.data) {
    body = handles.isError
      ? <RoomUnreachable room={ROOM} onRetry={() => { void handles.refetch(); }} />
      : <RoomRetrieving room={ROOM} />;
  } else {
    const named = handles.data;
    body = hidden.map((h) => {
      const handle = named[h.id];
      const who = handle ? `@${handle}` : 'A member who has left the house';
      const act = h.how === 'block' ? 'UNBLOCK' : 'UNMUTE';
      return (
        <View key={h.id} style={s.row}>
          <View style={s.who}>
            <Text style={s.handle} numberOfLines={1} {...scaledTextProps}>{who}</Text>
            <Text style={s.how} {...scaledTextProps}>{h.how === 'block' ? 'BLOCKED' : 'MUTED'}</Text>
          </View>
          <PressableScale
            style={s.letBack}
            onPress={() => letBack(h)}
            hitSlop={null}
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`${act === 'UNBLOCK' ? 'Unblock' : 'Unmute'} ${who}`}
          >
            <Text style={s.letBackText} {...scaledTextProps}>{act}</Text>
          </PressableScale>
        </View>
      );
    });
  }

  return (
    <SectionCard>
      <SectionHead icon={EyeOff} label="THOSE YOU HAVE HIDDEN" />
      <View style={s.body}>{body}</View>
    </SectionCard>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 8 },
  line: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.bone, paddingVertical: 8 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6,
    borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.1)',
  },
  who: { flex: 1, minWidth: 0 },
  handle: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment, includeFontPadding: false },
  how: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.5, color: colors.fog, marginTop: 4, includeFontPadding: false },
  letBack: {
    minHeight: 48, minWidth: 48, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.sepia, borderRadius: 2,
  },
  letBackText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
});
