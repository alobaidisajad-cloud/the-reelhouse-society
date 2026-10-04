import { useCallback, memo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/src/components/text';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { tmdb } from '@/src/lib/tmdb';
import { initialOf } from '@/src/utils/text';
import { nav } from '@/src/utils/typedRouter';
import { colors, fonts, SEPIA_HASH } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { useTextScale } from '@/src/hooks/useTextScale';

interface CastMember {
    id: number;
    name: string;
    character?: string;
    profile_path?: string | null;
}

const keyExtractor = (item: CastMember, index: number) => `${item.id}-${index}`;

const CastCard = memo(function CastCard({ item, nameBlock }: { item: CastMember; nameBlock: number }) {
    const handlePress = useCallback(() => {
        if (item.id) {
            nav.push(`/person/${item.id}`);
        }
    }, [item.id]);

    const photoUri = item.profile_path ? tmdb.profile(item.profile_path) : null;
    return (
        <PressableScale
            style={s.castCard}
            onPress={handlePress}
            haptic="selection"
            accessibilityRole="button"
            accessibilityLabel={`${item.name}${item.character ? `, as ${item.character}` : ''}. Opens their filmography.`}
        >
            <View style={s.castPhotoWrap}>
                {photoUri ? (
                    <>
                        <Image source={{ uri: photoUri }} style={s.castPhoto} contentFit="cover" cachePolicy="memory-disk" placeholder={{ blurhash: SEPIA_HASH }} transition={50} />
                        {/* Sepia tint — matches web filter: sepia(0.15) */}
                        <View style={s.sepiaTint} />
                    </>
                ) : (
                    <View style={[s.castPhoto, s.castPhotoPlaceholder]}>
                        <Text style={s.castPhotoPlaceholderText}>
                            {initialOf(item.name) || '?'}
                        </Text>
                    </View>
                )}
            </View>
            {/**
              * ── A BILLED ACTOR'S NAME IS NOT NEGOTIABLE ────────────────────
              * One line in a 100pt card would make Anne Hathaway "Anne
              * Hatha…", on the section whose entire job is naming people, and
              * shrinking alone cannot clear it. Two lines, and the rail pays
              * for the second below.
              */}
            <Text style={[s.castName, { minHeight: nameBlock }]} numberOfLines={NAME_LINES} adjustsFontSizeToFit minimumFontScale={0.75}>{item.name}</Text>
            <Text style={s.castRole} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.character}</Text>
        </PressableScale>
    );
});

const CarouselSeparator = () => <View style={{ width: 16 }} />;

/** React Native's default line height for a face with none set. */
const LINE = 1.27;
export const PHOTO_H = 150;
export const PHOTO_GAP = 8;
export const NAME_SIZE = 14;
export const NAME_LINES = 2;
export const NAME_GAP = 2;
export const ROLE_SIZE = 10;
/** Air under the last line, so the rail does not end on a descender. */
export const RAIL_HEM = 5;

/**
 * ── THE RAIL IS SIZED AT THE TYPE THE MEMBER READS ──────────────────────────
 * A fixed rail cannot grow to fit what is drawn in it, so it reserves room for
 * its text, at the size the phone actually draws it (held to the app's own
 * cap): a reserve for the default size only would let a grown two-line name
 * overrun the rail, and set a one-line name's role a line above its
 * neighbour's. At the default size this is 214 and 36.
 */
export function castCardMetrics(scale: number) {
    const line = (size: number) => Math.ceil(size * scale * LINE);
    const nameBlock = line(NAME_SIZE) * NAME_LINES;
    return {
        nameBlock,
        rail: PHOTO_H + PHOTO_GAP + nameBlock + NAME_GAP + line(ROLE_SIZE) + RAIL_HEM,
    };
}

export const CastCarousel = memo(function CastCarousel({ cast }: { cast: CastMember[] }) {
    const { nameBlock, rail } = castCardMetrics(useTextScale());
    const renderItem = useCallback(({ item }: { item: CastMember }) => {
        return <CastCard item={item} nameBlock={nameBlock} />;
    }, [nameBlock]);

    if (!cast || cast.length === 0) return null;

    return (
        <View style={{ height: rail }}>
            <FlashList
                data={cast}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.listContent}
                keyExtractor={keyExtractor}
                extraData={nameBlock}
                estimatedItemSize={116}
                ItemSeparatorComponent={CarouselSeparator}
                renderItem={renderItem}
            />
        </View>
    );
})

const s = StyleSheet.create({
    listContent: { paddingHorizontal: 16 },
    castCard: { width: 100 },
    castPhotoWrap: { width: 100, height: PHOTO_H, borderRadius: 4, overflow: 'hidden', borderWidth: 1, borderColor: 'rgba(184,137,26,0.3)', marginBottom: PHOTO_GAP },
    castPhoto: { width: '100%', height: '100%' },
    sepiaTint: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(60,40,10,0.12)', zIndex: 1 },
    castPhotoPlaceholder: { backgroundColor: colors.soot, justifyContent: 'center', alignItems: 'center' },
    castPhotoPlaceholderText: { fontFamily: fonts.display, fontSize: 32, color: colors.fog },
    /**
     * ── THE ROLES HAVE TO LINE UP ─────────────────────────────────────────
     * With the name free to be one line or two, roles at two heights in one
     * row would read as a rendering fault rather than a rail. A fixed two
     * lines' worth reserves the same space whether the name needs it or not,
     * so every role starts on the same baseline. The reserve is set
     * where the card is drawn (`nameBlock`), because two lines is a different
     * height at every text size.
     */
    castName: { fontFamily: fonts.display, fontSize: NAME_SIZE, color: colors.parchment, marginBottom: NAME_GAP },
    /**
     * No tracking. A character is a name in upper and lower case, and lower case
     * is not letterspaced; spacing would cost a long character's name the room
     * a 100pt card does not have.
     */
    castRole: { fontFamily: fonts.sub, fontSize: ROLE_SIZE, color: colors.sepia }
});
