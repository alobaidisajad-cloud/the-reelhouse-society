import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, TextInput } from '@/src/components/text';
import { Image } from 'expo-image';
import { Check } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';
import { TryAgainLine } from '@/src/components/TryAgain';
import { MAX_LENGTHS } from '@/src/utils/sanitizeInput';

interface Props {
    dropCap: boolean;
    setDropCap: (v: boolean) => void;
    pullQuote: string;
    setPullQuote: (v: string) => void;
    editorialHeader: string | null;
    setEditorialHeader: (v: string | null) => void;
    availableBackdrops: { file_path: string }[];
    /** TMDB has answered (so "none found" may be said). */
    imagesLoaded: boolean;
    /** The stills could not be asked for. */
    imagesFailed: boolean;
    onRetryImages: () => void;
}

const backdropKeyExtractor = (p: { file_path: string }) => p.file_path;

/**
 * THE STILLS NEED NO HALO.
 *
 * They sit 8pt apart, and in an overlap the LATER sibling wins on both
 * platforms, so a halo would let the edge of one still select the next. Each
 * thumb is 48pt by its own geometry, the only measure either platform's
 * accessibility layer can see; a halo past that is the neighbour's area.
 */

export default React.memo(function EditorialDesk({
    dropCap, setDropCap, pullQuote, setPullQuote, editorialHeader, setEditorialHeader, availableBackdrops,
    imagesLoaded, imagesFailed, onRetryImages,
}: Props) {
    // Each still is a picture, so it is NAMED, and says whether it is chosen.
    const renderBackdropItem = React.useCallback(({ item: p, index }: { item: { file_path: string }; index: number }) => p.file_path === '__none__' ? (
        <PressableScale onPress={() => { setEditorialHeader(null); }} style={[st.stillThumb, editorialHeader === null && st.stillActive]} haptic="selection" pressedScale={0.96} hitSlop={null}
            accessibilityRole="button" accessibilityLabel="No header still" accessibilityState={{ selected: editorialHeader === null }}>
            <Text style={[st.stillNone, editorialHeader === null && st.stillNoneActive]}>NONE</Text>
        </PressableScale>
    ) : (
        <PressableScale onPress={() => { setEditorialHeader(p.file_path); }} haptic="selection" pressedScale={0.96} hitSlop={null}
            accessibilityRole="button" accessibilityLabel={`Header still ${index}`} accessibilityState={{ selected: editorialHeader === p.file_path }}>
            <Image source={{ uri: tmdb.backdrop(p.file_path, 'w300') }} style={[st.stillImg, editorialHeader === p.file_path && st.stillImgActive, editorialHeader && editorialHeader !== p.file_path && st.stillImgFaded]} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        </PressableScale>
    ), [editorialHeader, setEditorialHeader]);

    return (
        // NO TITLE OF ITS OWN: the panel this sits in is already headed
        // ✦ THE EDITORIAL DESK, and a second would say it twice, in two faces.
        <View style={st.editDesk}>
            <View style={st.editRow}>
                <Text style={st.editLabel}>STYLIZED DROP CAP</Text>
                {/* Named, and said to be on or off — never "ENABLE, button". */}
                <PressableScale style={st.spoilerRow} onPress={() => { setDropCap(!dropCap); }} hitSlop={null} haptic="selection" pressedScale={0.96}
                    accessibilityRole="checkbox" accessibilityLabel="Stylized drop cap" accessibilityState={{ checked: dropCap }}>
                    <View style={[st.cbox, dropCap && st.cboxSepia]}>{dropCap && <Check size={10} color={colors.ink} />}</View>
                    <Text style={st.editToggleText}>ENABLE</Text>
                </PressableScale>
            </View>
            
            <View>
                <Text style={st.editLabel}>PULL QUOTE</Text>
                <TextInput style={st.pullQuoteInput} placeholder="Highlight a memorable line..." placeholderTextColor={colors.fog} value={pullQuote} onChangeText={setPullQuote} maxLength={MAX_LENGTHS.pullQuote} multiline={true} textAlignVertical="top" {...scaledTextProps} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} keyboardAppearance="dark" accessibilityLabel="Pull quote" />
            </View>
            
            <View>
                <Text style={st.editLabel}>ARTICLE HEADER (STILL)</Text>
                {/* A plain scroller, not a FlashList: a horizontal virtualised
                    list nested inside a vertical ScrollView has no bounded height
                    to measure against, and its documented failure is to render
                    NOTHING. Ten stills need no virtualisation; a scroller is
                    cheaper and certain to draw. */}
                {availableBackdrops.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGap} keyboardShouldPersistTaps="handled">
                        {[{ file_path: '__none__' }, ...availableBackdrops].map((p, i) => (
                            <React.Fragment key={backdropKeyExtractor(p)}>{renderBackdropItem({ item: p, index: i })}</React.Fragment>
                        ))}
                    </ScrollView>
                ) : imagesFailed ? (
                    <View>
                        <Text style={st.noData}>The stills could not be reached.</Text>
                        <TryAgainLine onPress={onRetryImages} accessibilityLabel="Ask for the stills again" style={st.retrySpace} />
                    </View>
                ) : imagesLoaded ? (
                    // Said once TMDB has answered — never while the request is
                    // out, nor after it failed, of a film that has stills.
                    <Text style={st.noData}>No stills found.</Text>
                ) : null}
            </View>
        </View>
    );
});

const st = StyleSheet.create({
    editDesk: { padding: 16, borderWidth: 1, borderColor: colors.sepia, borderRadius: 6, backgroundColor: 'rgba(184,137,26,0.05)', gap: 16, marginBottom: 20 },
    editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLabel: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 1.6, color: colors.bone, marginBottom: 8, includeFontPadding: false },
    editToggleText: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, includeFontPadding: false },
    pullQuoteInput: { backgroundColor: colors.well, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepia, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 14, fontStyle: 'italic', color: colors.parchment },
    // The drop-cap toggle: 48 tall by its own box, as every control on the
    // composer is (this file's `spoilerRow` shadows LogModalStyles', so it
    // carries the floor itself; a halo is invisible to accessibility).
    spoilerRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 48 },
    cbox: { width: 16, height: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    cboxSepia: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    stillThumb: { width: 80, height: 48, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    stillActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    stillNone: { fontFamily: fonts.sub, fontSize: 10, color: colors.fog, includeFontPadding: false },
    stillImg: { width: 80, height: 48, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    stillImgActive: { borderWidth: 2, borderColor: colors.sepia },
    stillImgFaded: { opacity: 0.4 },
    stillNoneActive: { color: colors.ink },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },
    retrySpace: { marginTop: 8, alignSelf: 'flex-start' },
    flatListGap: { gap: 8 },
});
