/**
 * The masthead: the room's own name, lit by its bulbs, and today's number in
 * the Dispatch's own form — the same `issueOf` and `dayLabel`, from the phone's
 * own clock, so the Lobby and the Dispatch never print two dates.
 */
import React, { memo, useEffect, useState } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { colors } from '@/src/theme/theme';
import { issueOf } from '@/src/components/dispatch/paper/paperMetrics';
import { dayLabel } from '@/src/components/dispatch/dayLabel';
import { Bulbs, HouseLine } from './parts';
import { MAST_GAPS, MAST_LINES } from './measure';
import { MASTHEAD } from './words';

/** The house knows the hour: the line under the masthead. */
export function whisperFor(hour: number): string {
  if (hour >= 5 && hour < 12) return 'the morning screening begins';
  if (hour >= 12 && hour < 17) return 'the matinée is in session';
  if (hour >= 17 && hour < 22) return "tonight's programme is underway";
  return 'the midnight reel is spinning';
}

/** `No. 273 · WEDNESDAY, SEPTEMBER 30` — the Dispatch's running head, word for word. */
export const datelineOf = (d: Date) => `No. ${issueOf(d)} · ${dayLabel(d.toISOString())}`;

/**
 * The wall's clock: read again at the top of every hour (the hour's line, and
 * at midnight the date) and whenever the app comes back to the front, each new
 * reading handed to `onRead`. Its one timer and its listener end with the Lobby.
 */
export function useWallClock(onRead: (now: Date) => void): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function arm(t: Date) {
      clearTimeout(timer);
      const toNextHour = ((60 - t.getMinutes()) * 60 - t.getSeconds()) * 1000 - t.getMilliseconds();
      // a second past the hour, so the reading is in it
      timer = setTimeout(read, toNextHour + 1000);
    }
    function read() {
      const t = new Date();
      setNow(t);
      onRead(t);
      arm(t);
    }
    arm(new Date());
    const sub = AppState.addEventListener('change', (state) => { if (state === 'active') read(); });
    return () => { clearTimeout(timer); sub.remove(); };
  }, [onRead]);
  return now;
}

export const Masthead = memo(function Masthead({ wallW, now }: { wallW: number; now: Date }) {
  const dateline = datelineOf(now);
  return (
    <View style={s.mast}>
      <HouseLine type="kick" text={MASTHEAD.kick} room={wallW} style={s.kick} />
      <HouseLine type="mastName" text={MASTHEAD.name} room={wallW} style={s.name} header />
      <View style={s.bulbRow}>
        <Bulbs />
        {/* the dateline's own room is the wall less two short runs of bulbs */}
        <HouseLine type="dateline" text={dateline} room={wallW - 36} style={s.dateline} />
        <Bulbs />
      </View>
      <HouseLine type="whisper" text={whisperFor(now.getHours())} room={wallW} style={s.whisper} />
    </View>
  );
});

const s = StyleSheet.create({
  mast: { alignItems: 'center', paddingTop: 4, paddingBottom: MAST_GAPS.foot },
  kick: { color: colors.sepia, lineHeight: MAST_LINES.kick, textAlign: 'center' },
  name: {
    color: colors.silverScreen, lineHeight: MAST_LINES.name, marginTop: MAST_GAPS.afterKick, textAlign: 'center',
    textShadowColor: 'rgba(236,190,120,0.18)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 22,
  },
  bulbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: MAST_GAPS.afterName, alignSelf: 'stretch' },
  dateline: { color: colors.bone, lineHeight: MAST_LINES.dateline, flexShrink: 1 },
  whisper: { color: colors.fog, lineHeight: MAST_LINES.whisper, marginTop: MAST_GAPS.afterDateline, textAlign: 'center' },
});
