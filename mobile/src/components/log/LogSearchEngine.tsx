import React, { useState, useCallback, useEffect, useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { FlashList } from '@shopify/flash-list';
import { NOT_ANCHORED } from '@/src/components/layout/CinematicFlashList';
import { Image } from 'expo-image';
import Animated, { Easing, useSharedValue, useAnimatedStyle, withRepeat, withTiming, cancelAnimation } from 'react-native-reanimated';
import { Search, Sparkles } from 'lucide-react-native';
import { Arrive } from '@/src/components/Arrive';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import { Brackets } from '@/src/components/log/LogFormBody';
import { st as modalSt } from '@/src/components/log/LogModalStyles';
import PressableScale from '@/src/components/PressableScale';
import SearchUnreachable from '@/src/components/search/SearchUnreachable';
import { useCatalogueSearch } from '@/src/hooks/useCatalogueSearch';

export interface LogSearchResult {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    backdrop_path?: string | null;
    release_date?: string;
    media_type?: string;
    vote_average?: number;
}

interface Props {
    onSelectFilm: (film: LogSearchResult) => void;
}

/**
 * A result may claim half the gap to the row below it, and no more.
 *
 * The rows sit 8pt apart, and where two targets overlap the LATER sibling
 * wins on both platforms: the default 15pt would let the foot of a result open
 * a record for the film below it, a mis-tap nobody would notice.
 *
 * 4pt is half the 8pt gap. The row is 74pt tall, so the target stays far past
 * the 44pt minimum. Sideways it has no neighbour at all.
 */
const ROW_SLOP = { top: 4, bottom: 4, left: 15, right: 15 } as const;

/**
 * A result's particulars: its year, and TMDB's score as a fact with its name on
 * it (as the film's own page prints it), never a bare star a member could take
 * for the house's verdict. Each only when there is one.
 */
export function resultMeta(r: Pick<LogSearchResult, 'release_date' | 'vote_average'>): string {
    const year = r.release_date?.slice(0, 4);
    const score = (r.vote_average ?? 0) > 0 ? `TMDB ${(r.vote_average ?? 0).toFixed(1)}` : '';
    return [year, score].filter(Boolean).join(' · ');
}

const LogSearchResultRow = React.memo(({ r, onSelectFilm }: { r: LogSearchResult, onSelectFilm: (film: LogSearchResult) => void }) => {
    const title = r.title || r.name || 'Untitled';
    const year = r.release_date?.slice(0, 4);
    const meta = resultMeta(r);
    return (
        <PressableScale style={st.resultRow} onPress={() => onSelectFilm(r)} hitSlop={ROW_SLOP} haptic="selection" pressedScale={0.96}
            accessibilityRole="button" accessibilityLabel={`Log ${title}${year ? `, ${year}` : ''}`}>
            {r.poster_path && <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={st.resultPoster} contentFit="cover" cachePolicy="memory-disk" transition={150} />}
            <View style={st.resultFlex}>
                <Text style={st.resultTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text>
                {meta ? (
                    <View style={st.resultMetaRow}>
                        <Text style={st.resultMeta}>{meta}</Text>
                    </View>
                ) : null}
            </View>
        </PressableScale>
    );
});

export default function LogSearchEngine({ onSelectFilm }: Props) {
    const [query, setQuery] = useState('');
    const search = useCatalogueSearch(query);
    const { searching, searchType, matchedContext: searchContext, unreachable } = search;
    // A person has no record to log: films only, and eight at most.
    const results = useMemo(
        (): LogSearchResult[] => search.results.filter((r) => r.media_type !== 'person').slice(0, 8),
        [search.results],
    );

    // Nitrate Noir Breathing Ember Protocol
    const emberOpacity = useSharedValue(0.5);
    useEffect(() => {
        if (searching) {
            emberOpacity.value = withRepeat(withTiming(1, { duration: 600 }), -1, true);
        } else {
            emberOpacity.value = withTiming(0.5, { duration: 300 });
        }
        return () => cancelAnimation(emberOpacity);
    }, [searching, emberOpacity]);

    const animatedIconStyle = useAnimatedStyle(() => ({
        opacity: emberOpacity.value,
    }));

    const renderItem = useCallback(({ item: r }: { item: LogSearchResult }) => (
        <LogSearchResultRow r={r} onSelectFilm={onSelectFilm} />
    ), [onSelectFilm]);

    return (
        <Arrive name="log.search" duration={400} rise={0} easing={Easing.out(Easing.cubic)} style={st.searchStep}>
            {/* Marked, like the docket it is about to become. The room says
                nothing else — the invitation was already made at the door. */}
            <View style={modalSt.bracketed}>
            <Brackets />
            <View style={st.searchWrap}>
                <Animated.View style={[st.searchIcon, animatedIconStyle]}>
                    <Search size={16} color={searching ? colors.sepia : colors.fog} />
                </Animated.View>
                <TextInput
                    style={st.searchInput}
                    placeholder="Search for a film..."
                    placeholderTextColor={colors.fog}
                    value={query}
                    onChangeText={setQuery}
                    autoFocus
                    returnKeyType="search"
                    maxLength={120}
                    selectionColor={colors.sepia}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    autoCorrect={false}
                    spellCheck={false}
                    autoCapitalize="words"
                    keyboardAppearance="dark"
                    accessibilityLabel="Search for a film to log"
                />
            </View>
            </View>
            {searching && (
                <View style={st.searchingWrap}><Text style={st.searchingText}>TRANSMITTING QUERY...</Text></View>
            )}
            {results.length > 0 && searchType === 'person' && (
                <View style={st.searchBadgeRow}>
                    <Sparkles size={8} color={colors.sepia} strokeWidth={1.5} />
                    <Text style={[st.searchBadge, st.searchBadgeSepia]}>ACTOR/DIRECTOR MATCH: {searchContext.toUpperCase()}</Text>
                </View>
            )}
            {results.length > 0 && searchType === 'typo' && (
                <View style={st.searchBadgeRow}>
                    <Sparkles size={8} color={colors.flicker} strokeWidth={1.5} />
                    <Text style={[st.searchBadge, st.searchBadgeFlicker]}>FUZZY RESCUE: {searchContext.toUpperCase()}</Text>
                </View>
            )}
            <FlashList
                maintainVisibleContentPosition={NOT_ANCHORED}
                data={results}
                keyExtractor={r => String(r.id)}
                style={st.searchResults}
                contentContainerStyle={st.searchResultsContent}
                estimatedItemSize={74}
                renderItem={renderItem}
                keyboardShouldPersistTaps="handled"
            />
            {/* TRIMMED: spaces are not a search (the request is never sent for
                them), so a field holding only spaces is never answered "No films
                found for ' '", and the message names what was looked for. */}
            {unreachable && <SearchUnreachable onRetry={search.retry} />}
            {!searching && !unreachable && query.trim().length > 0 && results.length === 0 && (
                <View style={st.noResultsWrap}>
                    {/* eslint-disable-next-line react/no-unescaped-entities */}
                    <Text style={st.noResultsText}>No films found for "{query.trim()}"</Text>
                </View>
            )}
        </Arrive>
    );
}

const st = StyleSheet.create({
    searchStep: { flex: 1, paddingHorizontal: 20 },
    // Inside the bracket, which sets its own inset — a margin here would push
    // the top marks away from the field they mark.
    searchWrap: { position: 'relative' },
    searchIcon: { position: 'absolute', left: 12, top: 14, zIndex: 1 },
    searchInput: { backgroundColor: colors.well, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, paddingLeft: 38, paddingRight: 12, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
    searchingWrap: { alignItems: 'center', paddingVertical: 20 },
    searchingText: { fontFamily: fonts.sub, fontSize: 10, color: colors.sepia, letterSpacing: 2.4, includeFontPadding: false },
    searchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    searchBadge: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1, includeFontPadding: false },
    searchBadgeSepia: { color: colors.sepia },
    searchBadgeFlicker: { color: colors.flicker },
    searchResults: { marginTop: 8 },
    searchResultsContent: { gap: 8, paddingBottom: 40 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 10 },
    resultPoster: { width: 36, height: 54, borderRadius: 2 },
    resultFlex: { flex: 1 },
    resultTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    resultMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    resultMeta: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, letterSpacing: 1, includeFontPadding: false },
    noResultsWrap: { alignItems: 'center', paddingVertical: 40 },
    noResultsText: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog },
});


LogSearchResultRow.displayName = 'LogSearchResultRow';
