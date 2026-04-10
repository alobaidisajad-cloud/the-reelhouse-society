import React, { memo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { ArrowRight } from 'lucide-react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { colors, fonts } from '@/src/theme/theme';

const TMDB_IMG_W185 = 'https://image.tmdb.org/t/p/w185';

interface FilmStripRowProps {
    films: any[];
    title: string;
    label: string;
    description?: string;
}

export const FilmStripRow = memo(function FilmStripRow({ films = [], title, label, description }: FilmStripRowProps) {
    const router = useRouter();

    return (
        <View style={s.container}>
            {/* Header Layout */}
            <View style={s.headerRow}>
                <View style={s.headerLeft}>
                    <LinearGradient 
                        colors={[colors.sepia, 'rgba(139,105,20,0.3)']} 
                        style={s.indicator} 
                    />
                    <View>
                        <Text style={s.label}>{label.toUpperCase()}</Text>
                        <Text style={s.title}>{title}</Text>
                    </View>
                </View>

                <TouchableOpacity 
                    style={s.viewAllBtn}
                    onPress={() => router.push('/explore')}
                    activeOpacity={0.6}
                >
                    <Text style={s.viewAllText}>VIEW ALL</Text>
                    <ArrowRight size={10} color={colors.sepia} style={{ opacity: 0.85 }} />
                </TouchableOpacity>
            </View>

            {/* Description */}
            {description && (
                <View style={s.descWrap}>
                    <Text style={s.description}>{description}</Text>
                </View>
            )}

            {/* Carousel */}
            <FlatList
                horizontal
                data={films.slice(0, 15)}
                keyExtractor={(item) => item.id.toString()}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.listContent}
                snapToInterval={120 + 16} // card width + gap
                decelerationRate="fast"
                renderItem={({ item, index }) => (
                    <Animated.View entering={FadeInRight.delay(index * 50).duration(400)}>
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => router.push(`/film/${item.id}`)}
                            style={s.card}
                        >
                            <Image 
                                source={{ uri: `${TMDB_IMG_W185}${item.poster_path}` }} 
                                style={s.poster}
                            />
                        </TouchableOpacity>
                    </Animated.View>
                )}
            />
        </View>
    );
});

const s = StyleSheet.create({
    container: {
        marginVertical: 24,
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 16,
    },
    headerLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
    indicator: {
        width: 3,
        height: 28,
        borderRadius: 2,
    },
    label: {
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.sepia,
        marginBottom: 2,
    },
    title: {
        fontFamily: fonts.display,
        fontSize: 20,
        color: colors.parchment,
    },
    viewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    viewAllText: {
        fontFamily: fonts.uiMedium,
        fontSize: 9,
        letterSpacing: 2,
        color: colors.fog,
    },
    descWrap: {
        paddingLeft: 35,
        paddingRight: 16,
        marginBottom: 20,
    },
    description: {
        fontFamily: fonts.body,
        fontSize: 13,
        color: colors.bone,
        opacity: 0.75,
        lineHeight: 20,
    },
    listContent: {
        paddingHorizontal: 16,
        gap: 16,
    },
    card: {
        width: 120,
    },
    poster: {
        width: 120,
        height: 180,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.1)',
        backgroundColor: colors.soot,
    },
});
