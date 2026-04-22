import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, FlatList, TouchableOpacity } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, Easing } from 'react-native-reanimated';
import { Search, Sparkles, Star } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';

export interface LogSearchResult {
    id: number;
    title?: string;
    name?: string;
    poster_path?: string | null;
    release_date?: string;
    media_type?: string;
    vote_average?: number;
}

interface Props {
    onSelectFilm: (film: LogSearchResult) => void;
}

export default function LogSearchEngine({ onSelectFilm }: Props) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LogSearchResult[]>([]);
    const [searching, setSearching] = useState(false);
    const [searchType, setSearchType] = useState('');
    const [searchContext, setSearchContext] = useState('');
    const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handleSearch = useCallback((q: string) => {
        setQuery(q);
        if (!q.trim()) { setResults([]); setSearching(false); return; }
        setSearching(true);
        if (searchTimeout.current) clearTimeout(searchTimeout.current);
        searchTimeout.current = setTimeout(async () => {
            try {
                const res = await tmdb.search(q, 1);
                const filtered = (res.results || []).filter((r: any) => r.media_type !== 'person').slice(0, 8);
                setResults(filtered);
                setSearchType(res.searchType || 'exact');
                setSearchContext(res.matchedContext || '');
            } catch (err: unknown) { setResults([]); }
            finally { setSearching(false); }
        }, 400);
    }, []);

    return (
        <Animated.View entering={FadeIn.duration(400).easing(Easing.out(Easing.cubic))} style={st.searchStep}>
            <View style={st.searchWrap}>
                <Search size={16} color={colors.fog} style={st.searchIcon} />
                <TextInput
                    style={st.searchInput}
                    placeholder="Search for a film..."
                    placeholderTextColor={colors.fog}
                    value={query}
                    onChangeText={handleSearch}
                    autoFocus
                    returnKeyType="search"
                    maxLength={120}
                    selectionColor={colors.sepia}
                    cursorColor={colors.sepia}
                    disableFullscreenUI={true}
                    autoCorrect={false}
                    spellCheck={false}
                    autoCapitalize="words"
                />
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
            <FlatList
                data={results}
                keyExtractor={r => String(r.id)}
                style={st.searchResults}
                contentContainerStyle={st.searchResultsContent}
                renderItem={({ item: r }) => (
                    <TouchableOpacity style={st.resultRow} onPress={() => onSelectFilm(r)} activeOpacity={0.7} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}>
                        {r.poster_path && <Image source={{ uri: tmdb.poster(r.poster_path, 'w92') }} style={st.resultPoster} contentFit="cover" cachePolicy="memory-disk" />}
                        <View style={st.resultFlex}>
                            <Text style={st.resultTitle} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{r.title || r.name}</Text>
                            <View style={st.resultMetaRow}>
                                <Text style={st.resultMeta}>{r.release_date?.slice(0, 4)} · {r.vote_average?.toFixed(1)}</Text>
                                <Star size={8} color={colors.sepia} fill={colors.sepia} />
                            </View>
                        </View>
                    </TouchableOpacity>
                )}
            />
            {!searching && query.length > 0 && results.length === 0 && (
                <View style={st.noResultsWrap}>
                    <Text style={st.noResultsText}>No films found for "{query}"</Text>
                </View>
            )}
        </Animated.View>
    );
}

const st = StyleSheet.create({
    searchStep: { flex: 1, paddingHorizontal: 20 },
    searchWrap: { marginTop: 12, position: 'relative' },
    searchIcon: { position: 'absolute', left: 12, top: 14, zIndex: 1 },
    searchInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, paddingLeft: 38, paddingRight: 12, paddingVertical: 12, fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    searchingWrap: { alignItems: 'center', paddingVertical: 20 },
    searchingText: { fontFamily: fonts.ui, fontSize: 10, color: colors.sepia, letterSpacing: 3 },
    searchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    searchBadge: { fontFamily: fonts.ui, fontSize: 9, letterSpacing: 1.5 },
    searchBadgeSepia: { color: colors.sepia },
    searchBadgeFlicker: { color: colors.flicker },
    searchResults: { marginTop: 8 },
    searchResultsContent: { gap: 8, paddingBottom: 40 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 10 },
    resultPoster: { width: 36, height: 54, borderRadius: 2 },
    resultFlex: { flex: 1 },
    resultTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    resultMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    resultMeta: { fontFamily: fonts.ui, fontSize: 9, color: colors.fog, letterSpacing: 1.5 },
    noResultsWrap: { alignItems: 'center', paddingVertical: 40 },
    noResultsText: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog },
});
