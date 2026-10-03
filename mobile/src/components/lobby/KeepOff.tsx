/**
 * KEEP OFF THE LOBBY — an admin's switch, drawn only for an admin.
 * ─────────────────────────────────────────────────────────────────────────────
 * The house chooses the Lobby by what members certify and critique, and a
 * crude log could win a day. An admin keeps it off: `set_lobby_withheld`
 * (admins only, refused to anyone else by the database itself) takes it off
 * every edition at once, takes back the notice that told its author, and keeps
 * it from being chosen again. The wall is read again, and the next piece hangs.
 */
import React, { memo, useCallback, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import PressableScale from '@/src/components/PressableScale';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/theme/theme';
import reelToast from '@/src/utils/reelToast';
import TactileEngine from '@/src/utils/TactileEngine';
import { HouseLine } from './parts';
import { WALL_KEY } from './wallRead';
import { KEEP_OFF } from './words';

export const KeepOff = memo(function KeepOff({ kind, id, what, room }: {
  kind: 'log' | 'list' | 'post';
  id: string;
  /** what the piece is called to the admin: log, stack, filing */
  what: string;
  /** the width of the row it stands in, where it takes a line of its own (planWall's switchRoom) */
  room: number;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const keepOff = useCallback(() => {
    Alert.alert(`Keep this ${what} off the Lobby?`, `It leaves the wall now, and will not be chosen again. Its author's notice is taken back.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Keep it off',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await supabase.rpc('set_lobby_withheld', { p_kind: kind, p_target: id, p_keep_off: true });
            if (error) throw error;
            TactileEngine.warn();
            await queryClient.invalidateQueries({ queryKey: WALL_KEY });
            reelToast.success(`Kept off the Lobby.`);
          } catch {
            reelToast.error(`Could not keep it off — check your connection.`);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }, [id, kind, queryClient, what]);
  return (
    <PressableScale
      style={s.door}
      // 44 tall and its words wide: a halo would only reach the name beside it or the line above
      hitSlop={0}
      onPress={keepOff}
      disabled={busy}
      haptic="selection"
      accessibilityRole="button"
      accessibilityLabel={`Keep this ${what} off the Lobby`}
      accessibilityState={{ disabled: busy, busy }}
    >
      <HouseLine type="cta" text={KEEP_OFF} room={room} style={s.text} spoken={false} />
    </PressableScale>
  );
});

const s = StyleSheet.create({
  // no inset: its words are given the whole row (on a 375pt phone they need nearly all of it)
  door: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center' },
  text: { color: colors.crimsonInk },
});
