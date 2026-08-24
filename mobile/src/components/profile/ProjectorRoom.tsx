import { View, Text, StyleSheet, Share } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import TactileEngine from '@/src/utils/TactileEngine';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '../PressableScale';
import reelToast from '@/src/utils/reelToast';
import { scaledTextProps, decorativeTextProps } from '@/src/constants/textScaling';
import { standingFor } from '@/src/constants/standing';
import { tally } from './profileComputed';

/**
 * THE PROJECTOR ROOM — the one room that never got rebuilt, and the only one
 * that was showing numbers that were plainly wrong.
 *
 * A member with 2,481 films opened this page and saw a progress bar at ZERO.
 * The bar was `(films % 20) * 5` — a sawtooth with no relation to the ladder
 * printed directly above it, resetting every twenty films forever. The ring
 * beside it filled at a hundred and stayed full. The rank stopped moving at
 * fifty-one. Three indicators, three different scales, one of them empty for
 * exactly the members who use the app most.
 *
 * ── THE RULE THIS ROOM NOW FOLLOWS ───────────────────────────────────────────
 * At the top of the ladder there is nowhere left to go, so NO BAR IS DRAWN. A
 * full bar still implies distance remaining; an absent one says you have
 * arrived. In its place goes the member's actual record — every figure of which
 * the server already computes and the app was throwing away.
 */

interface CinephileStats {
    count: number;
    level: string;
    color: string;
    progress: number;
}

/** The pre-aggregated summary — real at any size, ~2KB, one round trip. */
export interface ProjectorRecord {
    longest_streak?: number | null;
    current_streak?: number | null;
    avg_rating?: number | string | null;
    /** [{ month: 'YYYY-MM', count }] over the member's WHOLE history. */
    monthly_activity?: { month: string; count: number }[] | null;
}

interface ProjectorUser {
    username?: string;
}

const AnimatedView = Animated.createAnimatedComponent(View);

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

/**
 * "MAR '24" from "2024-03".
 *
 * By hand, never through Intl: Hermes may ship without it, and when it does the
 * options are ignored silently rather than throwing — so the failure looks like
 * a design choice rather than a bug.
 */
function monthLabel(key: string): string {
    const m = /^(\d{4})-(\d{2})$/.exec(String(key ?? ''));
    if (!m) return '—';
    const idx = parseInt(m[2], 10) - 1;
    if (idx < 0 || idx > 11) return '—';
    return `${MONTHS[idx]} '${m[1].slice(2)}`;
}

/** The heaviest month on record, or null when there is nothing to show. */
export function heaviestMonth(activity?: { month: string; count: number }[] | null) {
    if (!Array.isArray(activity) || activity.length === 0) return null;
    let best = activity[0];
    for (const m of activity) if ((m?.count ?? 0) > (best?.count ?? 0)) best = m;
    if (!best || !(best.count > 0)) return null;
    return { label: monthLabel(best.month), count: best.count };
}

function StatDial({ count, color, progress, isHighest }: { count: number; color: string; progress: number; isHighest: boolean }) {
    const size = 140;
    const strokeWidth = 3;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    /**
     * The ring shows progress along the CURRENT rung — the same number the bar
     * shows — instead of `count / 100`, which pinned itself at full for anyone
     * past a hundred films and then said nothing ever again.
     */
    const fraction = isHighest ? 1 : Math.max(0, Math.min(1, progress / 100));

    return (
        <View style={[ds.dialWrap, { width: size, height: size }]}>
            <Svg width={size} height={size} style={ds.dialSvg}>
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke="rgba(184,137,26,0.15)" strokeWidth={strokeWidth}
                />
                <Circle
                    cx={size / 2} cy={size / 2} r={radius}
                    fill="none" stroke={color} strokeWidth={strokeWidth}
                    strokeDasharray={`${circumference * fraction} ${circumference * (1 - fraction)}`}
                    strokeDashoffset={circumference * 0.25}
                    strokeLinecap="round"
                />
            </Svg>
            <Text {...scaledTextProps} style={[ds.dialValue, { color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {tally(count)}
            </Text>
            {/* "FILMS ON FILE", not "LIFETIME LOGS" — the app calls them films
                on every other surface, and a member should not have to learn a
                second word for the same thing on one screen. */}
            <Text {...scaledTextProps} style={ds.dialLabel}>FILMS ON FILE</Text>
        </View>
    );
}

export function ProjectorRoom({ stats, user, record, streak }: {
    stats?: CinephileStats;
    user?: ProjectorUser;
    record?: ProjectorRecord | null;
    /**
     * The run the member is on, already resolved by the screen: the server's
     * figure, falling back to a local count when no analytics payload arrived.
     * Passed in rather than read off `record` so there is ONE answer — the
     * fallback exists precisely for the case where `record` is null.
     */
    streak?: number | null;
}) {
    if (!stats) return null;

    const standing = standingFor(stats.count);
    const heaviest = heaviestMonth(record?.monthly_activity);
    const longest = typeof record?.longest_streak === 'number' ? record.longest_streak : null;
    const avg = record?.avg_rating != null && Number(record.avg_rating) > 0
        ? Number(record.avg_rating).toFixed(1)
        : null;

    /**
     * THE RUN THE MEMBER IS ON RIGHT NOW.
     *
     * `current_streak` was declared on this component's props, carried through
     * the hook as `serverStreak`, recomputed in profileComputed as `streak` —
     * and then never destructured by the screen. It reached the phone and
     * stopped. The SQL fix that made this number correct (it returned 1 or 0
     * for every member in the app) was repairing something nobody could see.
     *
     * It sits HERE rather than as a fourth cell in the record below, for two
     * reasons. A live streak is a different kind of fact from a historical
     * one — it is the only number on this card a member can change tonight, and
     * burying it beside AVERAGE MARK would say the opposite. And four cells at
     * 320pt with Dynamic Type at its ceiling leaves ~54pt of text width for a
     * label needing ~60pt, so "HEAVIEST" would clip mid-word.
     *
     * Prefers the resolved prop over the raw record: the screen already picks
     * the server's figure and falls back to a local count, and a current run —
     * unlike a taste fingerprint — IS computable from a window, because the
     * window is newest-first and any real run is far shorter than it.
     *
     * Two nights, not one: a single logged evening is not a run, and
     * "1 NIGHTS RUNNING" is not a sentence.
     */
    const runValue = typeof streak === 'number' ? streak : record?.current_streak;
    const run = typeof runValue === 'number' && runValue >= 2 ? runValue : null;
    /** Nothing to say yet is better than three em dashes in a row. */
    const hasRecord = longest != null || avg != null || heaviest != null;

    const handleShare = async () => {
        TactileEngine.mutate();
        try {
            await Share.share({
                message: `My ReelHouse Archive:\n\n${tally(stats.count)} films on file\nStanding: ${standing.name}\n\nThe ReelHouse Society`,
                title: 'ReelHouse Archive Stats',
            });
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'Unknown error';
            reelToast.error(msg);
        }
    };

    return (
        <View style={s.container}>
            <AnimatedView entering={FadeIn.duration(800)} style={s.dialWrap}>
                <View style={s.dialCard}>
                    <View style={ds.dialCenter}>
                        <StatDial count={stats.count} color={standing.color} progress={standing.progress} isHighest={standing.isHighest} />
                    </View>

                    <Text {...scaledTextProps} style={s.rankLabel}>STANDING</Text>
                    <Text {...scaledTextProps} style={[s.rankValue, { color: standing.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {standing.name}
                    </Text>

                    {run !== null && (
                        <Text
                            {...scaledTextProps}
                            style={s.runNote}
                            numberOfLines={1}
                            accessibilityLabel={`On a run of ${run} nights`}
                        >
                            {run} NIGHTS RUNNING
                        </Text>
                    )}

                    {standing.isHighest ? (
                        // NO BAR. There is nothing left to fill, and a full bar
                        // would still read as "distance remaining".
                        <Text {...scaledTextProps} style={s.rankNote}>the highest standing in the house</Text>
                    ) : (
                        <>
                            <View style={s.progressTrack} accessible={false}>
                                <View style={[s.progressFill, { width: `${standing.progress}%`, backgroundColor: standing.color }]} />
                            </View>
                            <Text
                                {...scaledTextProps}
                                style={s.trackNote}
                                accessibilityLabel={`${standing.toNext} more ${standing.toNext === 1 ? 'film' : 'films'} to reach ${standing.next?.name}`}
                            >
                                {standing.toNext} MORE TO {standing.next?.name}
                            </Text>
                        </>
                    )}

                    {/* THE RECORD — what replaces the dead bar for a member who
                        has run out of ladder. Every figure comes from the
                        server's summary, which is fetched on every profile load
                        already and was being discarded. */}
                    {hasRecord && (
                        <View style={s.record}>
                            {longest != null && (
                                <View style={s.recordCell}>
                                    <Text {...scaledTextProps} style={s.recV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{longest}</Text>
                                    <Text {...scaledTextProps} style={s.recL} numberOfLines={2}>LONGEST RUN</Text>
                                </View>
                            )}
                            {avg != null && (
                                <View style={[s.recordCell, longest != null && s.recordDivided]}>
                                    <Text {...scaledTextProps} style={s.recV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{avg}</Text>
                                    <Text {...scaledTextProps} style={s.recL} numberOfLines={2}>AVERAGE MARK</Text>
                                </View>
                            )}
                            {heaviest != null && (
                                <View style={[s.recordCell, (longest != null || avg != null) && s.recordDivided]}>
                                    <Text {...scaledTextProps} style={s.recV} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{heaviest.label}</Text>
                                    <Text {...scaledTextProps} style={s.recL} numberOfLines={2}>HEAVIEST MONTH</Text>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </AnimatedView>

            {stats.count > 0 && (
                <AnimatedView entering={FadeInDown.delay(200).duration(600)} style={s.certCard}>
                    <Text {...decorativeTextProps} style={s.certCornerTL}>✦</Text>
                    <Text {...decorativeTextProps} style={s.certCornerBR}>✦</Text>

                    <Text {...scaledTextProps} style={s.certSociety}>REELHOUSE PRESERVATION SOCIETY</Text>
                    <Text {...scaledTextProps} style={s.certTitle}>Certificate of Obsession</Text>
                    <Text {...scaledTextProps} style={s.certBody}>
                        This document certifies that the bearer has witnessed {tally(stats.count)} films and contributed to the archival history of The ReelHouse Society.
                    </Text>
                    <View style={[s.certBadge, { borderColor: standing.color }]}>
                        <Text {...scaledTextProps} style={[s.certBadgeText, { color: standing.color }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            {standing.name}
                        </Text>
                    </View>
                </AnimatedView>
            )}

            <AnimatedView entering={FadeInDown.delay(400).duration(600)} style={s.exportWrap}>
                <PressableScale style={s.exportBtn} onPress={handleShare} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} haptic accessibilityRole="button" accessibilityLabel="Share your standing">
                    <Text {...scaledTextProps} style={s.exportText}>SHARE YOUR STANDING</Text>
                </PressableScale>
            </AnimatedView>
        </View>
    );
}

const ds = StyleSheet.create({
    dialWrap: { alignItems: 'center', justifyContent: 'center' },
    dialSvg: { position: 'absolute', top: 0, left: 0 },
    dialCenter: { alignItems: 'center', marginBottom: 20 },
    dialValue: { fontFamily: fonts.display, fontSize: 32, lineHeight: 38, maxWidth: 118, textAlign: 'center' },
    dialLabel: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, marginTop: 2 },
});

const s = StyleSheet.create({
    container: { gap: 24 },
    dialWrap: { alignItems: 'center' },
    dialCard: {
        width: '100%', alignItems: 'center', paddingVertical: 26, paddingHorizontal: 20,
        backgroundColor: 'rgba(8,6,4,0.98)', borderWidth: 1, borderColor: 'rgba(184,137,26,0.2)', borderRadius: 3,
    },
    rankLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog, marginBottom: 8 },
    rankValue: { fontFamily: fonts.display, fontSize: 26, textAlign: 'center' },
    rankNote: { fontFamily: fonts.bodyItalic, fontSize: 11, lineHeight: 16, color: colors.bone, opacity: 0.7, marginTop: 6, textAlign: 'center' },
    // Deliberately quieter than the standing above it and louder than the track
    // note below: a live fact, not a headline and not fine print.
    runNote: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2.2, color: colors.sepia, opacity: 0.85, marginTop: 7, textAlign: 'center' },
    progressTrack: { width: '100%', height: 4, backgroundColor: 'rgba(184,137,26,0.15)', borderRadius: 2, overflow: 'hidden', marginTop: 18 },
    progressFill: { height: '100%', borderRadius: 2 },
    trackNote: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.6, color: colors.fog, marginTop: 9 },

    record: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 20, paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(232,223,208,0.08)' },
    recordCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    recordDivided: { borderLeftWidth: 1, borderLeftColor: 'rgba(232,223,208,0.08)' },
    recV: { fontFamily: fonts.display, fontSize: 18, lineHeight: 23, color: colors.parchment, textAlign: 'center' },
    recL: { fontFamily: fonts.sub, fontSize: 7.5, lineHeight: 11, letterSpacing: 1.5, color: colors.fog, marginTop: 4, textAlign: 'center' },

    certCard: {
        padding: 32, alignItems: 'center', backgroundColor: 'rgba(8,6,4,0.98)',
        borderWidth: 2, borderColor: colors.sepia, borderRadius: 4, position: 'relative',
    },
    certCornerTL: { position: 'absolute', top: 10, left: 12, fontFamily: fonts.display, fontSize: 32, color: colors.sepia, opacity: 0.15 },
    certCornerBR: { position: 'absolute', bottom: 10, right: 12, fontFamily: fonts.display, fontSize: 32, color: colors.sepia, opacity: 0.15 },
    certSociety: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.sepia, marginBottom: 12, textAlign: 'center' },
    certTitle: { fontFamily: fonts.display, fontSize: 24, color: colors.parchment, marginBottom: 12, textAlign: 'center' },
    certBody: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, textAlign: 'center', lineHeight: 20, maxWidth: 300, marginBottom: 20 },
    certBadge: { borderWidth: 1, paddingHorizontal: 24, paddingVertical: 8, transform: [{ rotate: '-5deg' }] },
    certBadgeText: { fontFamily: fonts.sub, fontSize: 16, letterSpacing: 2 },

    exportWrap: { alignItems: 'center', marginTop: 16 },
    exportBtn: {
        minHeight: 46, justifyContent: 'center', paddingHorizontal: 32, borderWidth: 1,
        borderColor: 'rgba(184,137,26,0.3)', borderRadius: 2, backgroundColor: 'rgba(10,7,3,0.5)',
    },
    exportText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 3, color: colors.fog },
});
