import React, { forwardRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ViewShot from 'react-native-view-shot';
import { colors, fonts } from '@/src/theme/theme';
import SkiaFilmGrain from '../FilmGrain';

interface TasteDNAExportCanvasProps {
    genres: [string, number][];
    username?: string;
}


// Standard Instagram Story aspect ratio is 9:16, but we can make a square or a specific card.
// Let's create a beautiful, cinematic 4:5 card for Instagram feed/stories.
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 1350;

// eslint-disable-next-line react/display-name
export const TasteDNAExportCanvas = forwardRef<ViewShot, TasteDNAExportCanvasProps>(
    ({ genres, username = 'CINEPHILE' }, ref) => {
        if (!genres || genres.length === 0) return null;

        const maxCount = genres[0][1];
        const dnaColors = ['#8B6914', '#A67B17', '#C4921E', '#D4A825', '#E0BC3A', '#F0D050'];

        return (
            <View style={s.offscreenContainer} pointerEvents="none">
                <ViewShot ref={ref} options={{ format: 'png', quality: 1.0 }} style={s.canvas}>
                    {/* Background */}
                    <View style={s.background}>
                        {/* We use Skia FilmGrain to give it real physical texture */}
                        <SkiaFilmGrain intensity={0.12} pointerEvents="none" />
                        
                        {/* Vignette */}
                        <View style={s.vignette} />

                        {/* Content Wrap */}
                        <View style={s.content}>
                            <View style={s.header}>
                                <Text style={s.societyLabel}>THE REELHOUSE SOCIETY</Text>
                                <View style={s.divider} />
                                <Text style={s.dossierTitle}>DOSSIER: {username.toUpperCase()}</Text>
                            </View>

                            <View style={s.mainBody}>
                                <Text style={s.title}>TASTE DNA</Text>
                                <Text style={s.subtitle}>CINEMATIC FINGERPRINT</Text>

                                <View style={s.dnaStrip}>
                                    {genres.map(([genre, count], i) => {
                                        const barWidth = `${(count / maxCount) * 100}%`;
                                        return (
                                            <View key={genre} style={s.row}>
                                                <Text style={s.genreLabel} numberOfLines={1}>{genre.toUpperCase()}</Text>
                                                <View style={s.barTrack}>
                                                    <View style={[s.barFill, { width: barWidth as any, backgroundColor: dnaColors[i] ?? colors.sepia }]} />
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>

                            {/* Footer Watermark */}
                            <View style={s.footer}>
                                <Text style={s.watermark}>DOCUMENT CLASSIFIED</Text>
                                <Text style={s.watermarkId}>ID: RH-{Math.floor(Math.random() * 90000) + 10000}</Text>
                            </View>
                        </View>
                    </View>
                </ViewShot>
            </View>
        );
    }
);

const s = StyleSheet.create({
    offscreenContainer: {
        position: 'absolute',
        top: -20000,
        left: -20000,
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
    },
    canvas: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        backgroundColor: '#050403', // Deepest black-brown
    },
    background: {
        flex: 1,
        position: 'relative',
    },
    vignette: {
        ...StyleSheet.absoluteFillObject,
        borderWidth: 100,
        borderColor: 'rgba(0,0,0,0.6)',
        borderRadius: CARD_WIDTH,
    },
    content: {
        flex: 1,
        padding: 80,
        justifyContent: 'space-between',
        zIndex: 10,
    },
    header: {
        alignItems: 'center',
        gap: 20,
    },
    societyLabel: {
        fontFamily: fonts.ui,
        fontSize: 24,
        letterSpacing: 8,
        color: colors.parchment,
        opacity: 0.6,
    },
    divider: {
        width: 100,
        height: 2,
        backgroundColor: colors.sepia,
        opacity: 0.5,
    },
    dossierTitle: {
        fontFamily: fonts.mono,
        fontSize: 28,
        letterSpacing: 4,
        color: colors.fog,
    },
    mainBody: {
        backgroundColor: 'rgba(10, 8, 6, 0.7)',
        padding: 60,
        borderWidth: 2,
        borderColor: 'rgba(139,105,20,0.3)',
        borderRadius: 8,
    },
    title: {
        fontFamily: fonts.ui,
        fontSize: 48,
        letterSpacing: 12,
        color: colors.sepia,
        marginBottom: 10,
        textAlign: 'center',
    },
    subtitle: {
        fontFamily: fonts.body,
        fontSize: 24,
        color: colors.fog,
        fontStyle: 'italic',
        marginBottom: 60,
        textAlign: 'center',
        opacity: 0.7,
    },
    dnaStrip: {
        gap: 40,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 30,
    },
    genreLabel: {
        fontFamily: fonts.ui,
        fontSize: 28,
        letterSpacing: 2,
        color: colors.fog,
        width: 250,
    },
    barTrack: {
        flex: 1,
        height: 20,
        backgroundColor: 'rgba(139,105,20,0.15)',
        borderRadius: 10,
        overflow: 'hidden',
    },
    barFill: {
        height: '100%',
        borderRadius: 10,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        opacity: 0.4,
    },
    watermark: {
        fontFamily: fonts.mono,
        fontSize: 20,
        letterSpacing: 4,
        color: colors.parchment,
    },
    watermarkId: {
        fontFamily: fonts.mono,
        fontSize: 20,
        letterSpacing: 2,
        color: colors.sepia,
    },
});
