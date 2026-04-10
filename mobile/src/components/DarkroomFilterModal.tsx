import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView, Dimensions, TouchableWithoutFeedback } from 'react-native';
import { X } from 'lucide-react-native';
import { colors, fonts } from '@/src/theme/theme';
import { useDiscoverStore } from '@/src/stores/discover';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const GENRES = [
    { id: 28, name: 'Action' }, { id: 27, name: 'Horror' }, { id: 878, name: 'Sci-Fi' },
    { id: 18, name: 'Drama' }, { id: 35, name: 'Comedy' }, { id: 80, name: 'Crime' },
    { id: 14, name: 'Fantasy' }, { id: 9648, name: 'Mystery' }, { id: 37, name: 'Western' },
    { id: 16, name: 'Animation' }, { id: 99, name: 'Documentary' }, { id: 10749, name: 'Romance' },
    { id: 53, name: 'Thriller' }, { id: 10751, name: 'Family' }, { id: 36, name: 'History' },
];

export const DECADES = [
    { label: '2020s', from: '2020-01-01', to: '2029-12-31' },
    { label: '2010s', from: '2010-01-01', to: '2019-12-31' },
    { label: '2000s', from: '2000-01-01', to: '2009-12-31' },
    { label: '1990s', from: '1990-01-01', to: '1999-12-31' },
    { label: '1980s', from: '1980-01-01', to: '1989-12-31' },
    { label: '70s & Earlier', from: '1900-01-01', to: '1979-12-31' },
];

export const SORT_OPTIONS = [
    { value: 'popularity.desc', label: 'Most Popular' },
    { value: 'vote_average.desc', label: 'Highest Rated' },
    { value: 'release_date.desc', label: 'Newest First' },
    { value: 'release_date.asc', label: 'Oldest First' },
    { value: 'revenue.desc', label: 'Box Office' },
    { value: 'vote_count.desc', label: 'Most Voted' },
];

export const LANGUAGES = [
    { iso: 'en', name: 'English' }, { iso: 'fr', name: 'French' }, { iso: 'es', name: 'Spanish' },
    { iso: 'ja', name: 'Japanese' }, { iso: 'ko', name: 'Korean' }, { iso: 'it', name: 'Italian' },
    { iso: 'de', name: 'German' }, { iso: 'zh', name: 'Chinese' }, { iso: 'ar', name: 'Arabic' },
    { iso: 'hi', name: 'Hindi' },
];

interface DarkroomFilterModalProps {
    visible: boolean;
    onClose: () => void;
}

const Chip = ({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) => (
    <TouchableOpacity
        style={[s.chip, active && s.chipActive]}
        onPress={onPress}
        activeOpacity={0.7}
    >
        <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
);

export function DarkroomFilterModal({ visible, onClose }: DarkroomFilterModalProps) {
    const { filters, updateFilter, clearFilters } = useDiscoverStore();

    const hasFilters = filters.genreId || filters.decade || filters.language || filters.minRating > 0;

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
        >
            <View style={s.overlay}>
                <TouchableWithoutFeedback onPress={onClose}>
                    <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <View style={s.sheet}>
                    <View style={s.header}>
                        <View style={s.headerLeft}>
                            <Text style={s.title}>ARCHIVE FILTERS</Text>
                            {hasFilters && (
                                <TouchableOpacity onPress={clearFilters} style={s.clearBtn}>
                                    <Text style={s.clearBtnText}>CLEAR ALL</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                        <TouchableOpacity style={s.closeBtn} onPress={onClose} hitSlop={20}>
                            <X size={20} color={colors.fog} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView style={s.scroll} contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
                        {/* GENRE */}
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>GENRE</Text>
                            <View style={s.chipContainer}>
                                {GENRES.map(g => (
                                    <Chip
                                        key={g.id}
                                        label={g.name}
                                        active={filters.genreId === g.id}
                                        onPress={() => updateFilter({ genreId: filters.genreId === g.id ? null : g.id })}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* DECADE */}
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>DECADE</Text>
                            <View style={s.chipContainer}>
                                {DECADES.map(d => (
                                    <Chip
                                        key={d.label}
                                        label={d.label}
                                        active={filters.decade?.label === d.label}
                                        onPress={() => updateFilter({ decade: filters.decade?.label === d.label ? null : d })}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* RATING */}
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>MIN RATING: {filters.minRating > 0 ? `${filters.minRating}+` : 'ANY'}</Text>
                            <View style={s.chipContainer}>
                                {[0, 6, 7, 7.5, 8, 8.5].map(r => (
                                    <Chip
                                        key={r.toString()}
                                        label={r === 0 ? 'Any' : `${r}+`}
                                        active={filters.minRating === r}
                                        onPress={() => updateFilter({ minRating: filters.minRating === r ? 0 : r })}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* LANGUAGE */}
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>LANGUAGE</Text>
                            <View style={s.chipContainer}>
                                {LANGUAGES.map(l => (
                                    <Chip
                                        key={l.iso}
                                        label={l.name}
                                        active={filters.language === l.iso}
                                        onPress={() => updateFilter({ language: filters.language === l.iso ? null : l.iso })}
                                    />
                                ))}
                            </View>
                        </View>

                        {/* SORT BY */}
                        <View style={s.section}>
                            <Text style={s.sectionTitle}>SORT BY</Text>
                            <View style={s.chipContainer}>
                                {SORT_OPTIONS.map(o => (
                                    <Chip
                                        key={o.value}
                                        label={o.label}
                                        active={filters.sortBy === o.value}
                                        onPress={() => updateFilter({ sortBy: o.value })}
                                    />
                                ))}
                            </View>
                        </View>
                        
                        <View style={{ height: 40 }} />
                    </ScrollView>
                    
                    {/* Apply Button */}
                    <View style={s.footer}>
                        <TouchableOpacity style={s.applyBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={s.applyBtnText}>APPLY & SEARCH</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(5, 3, 1, 0.85)',
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: colors.ink,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: SCREEN_HEIGHT * 0.85,
        minHeight: SCREEN_HEIGHT * 0.5,
        borderWidth: 1,
        borderColor: colors.ash,
        borderBottomWidth: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 24,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.ash,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
    },
    title: {
        fontFamily: fonts.uiMedium,
        fontSize: 12,
        letterSpacing: 2,
        color: colors.parchment,
    },
    clearBtn: {
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 4,
        backgroundColor: 'rgba(180,60,60,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(180,60,60,0.3)',
    },
    clearBtnText: {
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 1,
        color: 'rgba(200,80,80,0.9)',
    },
    closeBtn: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: colors.soot,
        alignItems: 'center',
        justifyContent: 'center',
    },
    scroll: {
        flex: 1,
    },
    content: {
        padding: 24,
        paddingBottom: 40,
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.sepia,
        marginBottom: 12,
    },
    chipContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        borderRadius: 4,
        backgroundColor: 'rgba(18,14,9,0.8)',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.22)',
    },
    chipActive: {
        backgroundColor: colors.sepia,
        borderColor: colors.sepia,
        shadowColor: colors.sepia,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    chipText: {
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 1,
        color: colors.bone,
    },
    chipTextActive: {
        color: colors.ink,
        fontFamily: fonts.uiMedium,
    },
    footer: {
        padding: 24,
        paddingTop: 16,
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: colors.ash,
        backgroundColor: colors.ink,
        paddingBottom: 32, 
    },
    applyBtn: {
        backgroundColor: colors.sepia,
        paddingVertical: 16,
        borderRadius: 4,
        alignItems: 'center',
        justifyContent: 'center',
    },
    applyBtnText: {
        fontFamily: fonts.uiMedium,
        fontSize: 12,
        letterSpacing: 3,
        color: colors.ink,
    }
});
