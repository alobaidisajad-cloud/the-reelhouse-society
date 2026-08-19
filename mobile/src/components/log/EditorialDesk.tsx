import React from 'react';
import { View, Text, StyleSheet, TextInput, ScrollView } from 'react-native';
import { Image } from 'expo-image';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import TactileEngine from '@/src/utils/TactileEngine';
import { Check } from 'lucide-react-native';
import { tmdb } from '@/src/lib/tmdb';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { scaledTextProps } from '@/src/constants/textScaling';

interface Props {
    dropCap: boolean;
    setDropCap: (v: boolean) => void;
    pullQuote: string;
    setPullQuote: (v: string) => void;
    editorialHeader: string | null;
    setEditorialHeader: (v: string | null) => void;
    availableBackdrops: { file_path: string }[];
}

const backdropKeyExtractor = (p: { file_path: string }) => p.file_path;

/**
 * THE STILLS NEED NO HALO.
 *
 * They used to claim 15pt on every side — PressableScale's default, which
 * applies to the sides you do not name as well — and sitting 8pt apart, two of
 * them overlapped by 22. In an overlap the LATER sibling wins on both
 * platforms, so the right-hand 7pt of every still selected the next one along.
 *
 * That was first fixed by halving the gap. It is fixed properly now: the thumb
 * is 48pt by its own geometry, which is the only measure either platform's
 * accessibility layer can see, and a control that reaches the floor on its own
 * has nothing left to ask for. A halo past that point is not generosity — it is
 * the neighbour's area.
 */

export default React.memo(function EditorialDesk({
    dropCap, setDropCap, pullQuote, setPullQuote, editorialHeader, setEditorialHeader, availableBackdrops
}: Props) {
    const renderBackdropItem = React.useCallback(({ item: p }: { item: { file_path: string } }) => p.file_path === '__none__' ? (
        <PressableScale onPress={() => { setEditorialHeader(null); }} style={[st.stillThumb, editorialHeader === null && st.stillActive]} haptic="selection" pressedScale={0.96} hitSlop={null}>
            <Text style={[st.stillNone, editorialHeader === null && st.stillNoneActive]}>NONE</Text>
        </PressableScale>
    ) : (
        <PressableScale onPress={() => { setEditorialHeader(p.file_path); }} haptic="selection" pressedScale={0.96} hitSlop={null}>
            <Image source={{ uri: tmdb.backdrop(p.file_path, 'w300') }} style={[st.stillImg, editorialHeader === p.file_path && st.stillImgActive, editorialHeader && editorialHeader !== p.file_path && st.stillImgFaded]} contentFit="cover" cachePolicy="memory-disk" transition={150} />
        </PressableScale>
    ), [editorialHeader, setEditorialHeader]);

    return (
        // NO TITLE OF ITS OWN. The panel this sits in is already headed
        // ✦ THE EDITORIAL DESK; a second one four points below it said the same
        // thing twice, in two different faces — the defect the manuscript had
        // and had fixed. Its only caller supplies the heading.
        <View style={st.editDesk}>
            <View style={st.editRow}>
                <Text style={st.editLabel}>STYLIZED DROP CAP</Text>
                <PressableScale style={st.spoilerRow} onPress={() => { setDropCap(!dropCap); }} hitSlop={{top: 15, left: 15, bottom: 15, right: 15}} haptic="selection" pressedScale={0.96}>
                    <View style={[st.cbox, dropCap && st.cboxSepia]}>{dropCap && <Check size={10} color={colors.ink} />}</View>
                    <Text style={st.editToggleText}>ENABLE</Text>
                </PressableScale>
            </View>
            
            <View>
                <Text style={st.editLabel}>PULL QUOTE</Text>
                <TextInput style={st.pullQuoteInput} placeholder="Highlight a memorable line..." placeholderTextColor={colors.fog} value={pullQuote} onChangeText={setPullQuote} maxLength={120} multiline={true} textAlignVertical="top" {...scaledTextProps} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} keyboardAppearance="dark" accessibilityLabel="Pull quote" />
            </View>
            
            <View>
                <Text style={st.editLabel}>ARTICLE HEADER (STILL)</Text>
                {/* A plain scroller, not a FlashList.
                    A horizontal virtualised list nested inside a vertical
                    ScrollView has no bounded height to measure against, and the
                    documented failure mode is that it renders NOTHING — which is
                    precisely the report on this feature: the Editorial Desk works
                    on the web and appears blank in the app. Ten stills need no
                    virtualisation; a scroller is cheaper and certain to draw. */}
                {availableBackdrops.length > 0 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGap} keyboardShouldPersistTaps="handled">
                        {[{ file_path: '__none__' }, ...availableBackdrops].map(p => (
                            <React.Fragment key={backdropKeyExtractor(p)}>{renderBackdropItem({ item: p })}</React.Fragment>
                        ))}
                    </ScrollView>
                ) : <Text style={st.noData}>No stills found.</Text>}
            </View>
        </View>
    );
});

const st = StyleSheet.create({
    editDesk: { padding: 16, borderWidth: 1, borderColor: colors.sepia, borderRadius: 6, backgroundColor: 'rgba(184,137,26,0.05)', gap: 16, marginBottom: 20 },
    editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.bone, marginBottom: 8, includeFontPadding: false },
    editToggleText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, includeFontPadding: false },
    pullQuoteInput: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepia, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 14, fontStyle: 'italic', color: colors.parchment },
    spoilerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cbox: { width: 16, height: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    cboxSepia: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    stillThumb: { width: 80, height: 48, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    stillActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    stillNone: { fontFamily: fonts.sub, fontSize: 7.5, color: colors.fog, includeFontPadding: false },
    stillImg: { width: 80, height: 48, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    stillImgActive: { borderWidth: 2, borderColor: colors.sepia },
    stillImgFaded: { opacity: 0.4 },
    stillNoneActive: { color: colors.ink },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },
    flatListGap: { gap: 8 },
});
