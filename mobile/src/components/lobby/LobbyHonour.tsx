/**
 * THE HONOUR STAYS — "✦ FEATURED IN THE LOBBY · 30 SEPTEMBER" on the page of a
 * log, a stack or a filing the house hung in the Lobby. Read from the record
 * of editions (lobby_editions): the day it hung first in its slot — the first
 * log, the first stack, one of the first three filings. A piece the house kept
 * off the Lobby loses the honour with it (set_lobby_withheld takes it out of
 * the record).
 *
 * It is a quiet embellishment, not the page's content: while it is read, or if
 * it cannot be, the page is simply without it — never a hole, never a notice.
 */
import React, { memo } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Text } from '@/src/components/text';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import { MONTHS } from '@/src/components/dispatch/dayLabel';

export type HonourKind = 'log' | 'list' | 'post';

/** `2026-09-30` → `30 SEPTEMBER`; with the year when it is not this year's. Never Intl (Hermes). */
export function honourDay(edition: string, now: Date = new Date()): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(edition);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = `${day} ${MONTHS[month - 1]}`;
  return year === now.getFullYear() ? date : `${date} ${year}`;
}

export const honourLine = (edition: string, now?: Date) => {
  const day = honourDay(edition, now);
  return day ? `✦ FEATURED IN THE LOBBY · ${day}` : null;
};

/** The latest day this piece hung first in its slot, or null. */
export async function readHonour(kind: HonourKind, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('lobby_editions')
    .select('edition')
    .eq('slot', kind)
    .eq('target_id', id)
    .lte('place', kind === 'post' ? 3 : 1)
    .order('edition', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as { edition?: string } | null)?.edition ?? null;
}

export const LobbyHonour = memo(function LobbyHonour({ kind, id, style }: {
  kind: HonourKind;
  id: string | null | undefined;
  style?: StyleProp<TextStyle>;
}) {
  // The record is the members' (lobby_editions is granted to them alone): a
  // visitor on a shared page is not refused twice on every open.
  const member = useAuthStore((st) => st.isAuthenticated);
  const { data } = useQuery({
    queryKey: ['lobby-honour', kind, id],
    queryFn: () => readHonour(kind, id as string),
    enabled: !!id && member,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });
  const line = data ? honourLine(data) : null;
  if (!line || !member) return null;
  return (
    // two lines at most: at the largest text on the narrowest phone the day wraps under, never ends in …
    <Text style={[s.honour, style]} numberOfLines={2} accessibilityLabel={line.replace('✦ ', '').toLowerCase()}>
      {line}
    </Text>
  );
});

const s = StyleSheet.create({
  honour: { fontFamily: fonts.sub, fontSize: 10, lineHeight: 15, letterSpacing: 1.6, color: colors.sepia },
});
