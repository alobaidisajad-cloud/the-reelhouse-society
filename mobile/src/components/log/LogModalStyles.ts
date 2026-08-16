// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { StyleSheet, Platform } from 'react-native';
import { colors, fonts, effects } from '@/src/theme/theme';

export const st = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.soot },
    centerAuthPrompt: { justifyContent: 'center', alignItems: 'center' },
    identifyText: { fontFamily: fonts.display, fontSize: 20, color: colors.parchment },
    kavFlex: { flex: 1 },
    dragHandleWrap: { alignItems: 'center', paddingTop: 10 },
    dragHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.ash },
    editBadge: { backgroundColor: colors.bloodReel, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 2, alignSelf: 'flex-start', marginBottom: 4 },
    editBadgeText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.parchmentBright, includeFontPadding: false },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 10 },
    headerTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment },
    closeBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8 },
    closeBtnText: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.fog, includeFontPadding: false },
    signInBtn: { marginTop: 20, backgroundColor: colors.sepia, borderRadius: 2, paddingVertical: 14, paddingHorizontal: 28 },
    signInBtnText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },

    // Search
    searchStep: { flex: 1, paddingHorizontal: 20 },
    searchWrap: { marginTop: 12, position: 'relative' },
    searchIcon: { position: 'absolute', left: 12, top: 14, zIndex: 1 },
    searchInput: { backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, paddingLeft: 38, paddingRight: 12, paddingVertical: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
    searchingWrap: { alignItems: 'center', paddingVertical: 20 },
    searchingText: { fontFamily: fonts.sub, fontSize: 9, color: colors.sepia, letterSpacing: 3, includeFontPadding: false },
    searchBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
    searchBadge: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1.5, includeFontPadding: false },
    searchBadgeSepia: { color: colors.sepia },
    searchBadgeFlicker: { color: colors.flicker },
    searchResults: { marginTop: 8 },
    searchResultsContent: { gap: 8, paddingBottom: 40 },
    resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 10 },
    resultPoster: { width: 36, height: 54, borderRadius: 2 },
    resultFlex: { flex: 1 },
    resultTitle: { fontFamily: fonts.sub, fontSize: 14, color: colors.parchment },
    resultMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
    resultMeta: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 1.5, includeFontPadding: false },
    noResultsWrap: { alignItems: 'center', paddingVertical: 40 },
    noResultsText: { fontFamily: fonts.sub, fontSize: 13, color: colors.fog },

    // Form
    formScroll: { flex: 1 },
    formContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 },
    sec: { marginBottom: 20 },
    secLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.sepia, marginBottom: 8, includeFontPadding: false },
    input: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4, padding: 12, fontFamily: fonts.body, fontSize: 13, color: colors.parchment },
    filmHeader: { flexDirection: 'row', gap: 16, marginBottom: 24 },

    // Previous Take (rewatch context)
    prevTakeBox: { backgroundColor: 'rgba(184,137,26,0.06)', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 8, padding: 14, marginBottom: -4 },
    prevTakeHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
    prevTakeLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.5, color: colors.sepia, includeFontPadding: false },
    prevTakeCountBadge: { backgroundColor: 'rgba(255,255,255,0.04)', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 3 },
    prevTakeCountText: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 0.8, color: colors.fog, includeFontPadding: false },
    prevTakeRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
    prevTakeRatingNum: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, includeFontPadding: false },
    prevTakeReview: { fontFamily: fonts.body, fontSize: 13, color: colors.bone, lineHeight: 20, opacity: 0.8, fontStyle: 'italic' },
    // iOS has no writingDirection unless it is stated, so an Arabic review
    // inherited the app's left-to-right base — the full stop landed at the far
    // LEFT of the line. Android resolves it itself. Same style as the record.
    rtlText: { writingDirection: 'rtl', textAlign: 'right' } as import('react-native').TextStyle,
    prevTakeDate: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 0.8, color: colors.fog, marginTop: 6, includeFontPadding: false },
    filmInfoCol: { flex: 1 },
    poster: { width: 100, height: 150, borderRadius: 3 },
    altBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: colors.sepia, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 2 },
    altBadgeText: { fontFamily: fonts.sub, fontSize: 6.5, color: colors.ink, letterSpacing: 1, includeFontPadding: false },
    filmTitle: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, lineHeight: 22 },
    filmYear: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.fog, letterSpacing: 2, marginTop: 4, includeFontPadding: false },
    statusRow: { flexDirection: 'row', gap: 8 },
    statusBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    statusActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    statusText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1.5, color: colors.fog, includeFontPadding: false },
    statusTextActive: { color: colors.ink },
    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    tag: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    tagActive: { backgroundColor: colors.flicker, borderColor: colors.flicker },
    tagText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
    tagTextActive: { color: colors.ink },

    // Rating
    ratingHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    ratingValue: { fontFamily: fonts.display, fontSize: 18, color: colors.flicker },
    ratingMax: { fontSize: 10, color: colors.fog },
    ratingBody: { alignItems: 'center', gap: 8 },
    ratingFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
    ratingLabel: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.sepia, letterSpacing: 2, includeFontPadding: false },
    ratingHint: { fontFamily: fonts.sub, fontSize: 7, letterSpacing: 1.5, color: colors.fog, opacity: 0.6, includeFontPadding: false },

    // More Toggle (LOGISTICS drawer)

    // Date
    quickDateRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
    qDateBtn: { paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    qDateActive: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    qDateText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
    qDateTextActive: { color: colors.ink },
    calendarWrap: { marginTop: 8 },

    // Review — THE MANUSCRIPT
    manuscriptFrame: { borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 4, backgroundColor: colors.ink, overflow: 'hidden' },
    manuscriptHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(184,137,26,0.15)', backgroundColor: 'rgba(184,137,26,0.05)' },
    manuscriptHeaderText: { fontFamily: fonts.sub, fontSize: 6.5, letterSpacing: 2, color: colors.sepia, includeFontPadding: false, flexShrink: 1 },
    reviewInput: { padding: 12, fontFamily: fonts.body, fontSize: 14, color: colors.parchment, minHeight: 130, lineHeight: 22, letterSpacing: 0.2 },
    reviewFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: 'rgba(184,137,26,0.12)' },
    spoilerRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    cbox: { width: 16, height: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    cboxOn: { backgroundColor: colors.bloodReel, borderColor: colors.bloodReel },
    cboxSepia: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    spoilerText: { fontFamily: fonts.sub, fontSize: 8, color: colors.fog, letterSpacing: 1, includeFontPadding: false },
    charCount: { fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
    charCountWarn: { color: colors.flicker },
    privateNotesInput: { minHeight: 80, backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },

    // Editorial (dead-dup keys kept swept — leaf owns live styles)
    editDesk: { padding: 16, borderWidth: 1, borderColor: colors.sepia, borderRadius: 6, backgroundColor: 'rgba(184,137,26,0.05)', gap: 16, marginBottom: 20 },
    editDeskTitle: { fontFamily: fonts.display, fontSize: 14, color: colors.sepia },
    editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    editLabel: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 2, color: colors.bone, marginBottom: 8, includeFontPadding: false },
    editToggleText: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.fog, includeFontPadding: false },
    pullQuoteInput: { backgroundColor: 'rgba(10,7,3,0.8)', borderWidth: 1, borderStyle: 'dashed', borderColor: colors.sepia, borderRadius: 4, padding: 12, fontFamily: fonts.sub, fontSize: 13, fontStyle: 'italic', color: colors.parchment },
    stillThumb: { width: 80, height: 45, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    stillActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    stillNone: { fontFamily: fonts.sub, fontSize: 7.5, color: colors.fog, includeFontPadding: false },
    stillImg: { width: 80, height: 45, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    stillImgActive: { borderWidth: 2, borderColor: colors.sepia },
    stillImgFaded: { opacity: 0.4 },
    stillNoneActive: { color: colors.ink },
    noData: { fontFamily: fonts.body, fontSize: 11, color: colors.fog },

    // Auteur (dead-dup keys kept swept — leaf owns live styles; autopsy blood is deliberate)
    auteurBox: { padding: 16, borderWidth: 1, borderColor: colors.bloodReel, borderRadius: 6, backgroundColor: 'rgba(107,26,10,0.05)', marginBottom: 20 },
    auteurLocked: { opacity: 0.5 },
    auteurHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    auteurHeadText: { fontFamily: fonts.display, fontSize: 12, color: colors.bloodReel },
    upgradeLockRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    upgradeLink: { fontFamily: fonts.sub, fontSize: 8.5, color: colors.bloodReel, textDecorationLine: 'underline' },
    autopContent: { gap: 20, marginTop: 16 },
    sliderRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    sliderLabel: { width: 90, fontFamily: fonts.sub, fontSize: 7.5, letterSpacing: 0.5, color: colors.fog, includeFontPadding: false },
    sliderTrack: { flex: 1, flexDirection: 'row', gap: 2, height: 20 },
    sliderSeg: { flex: 1, backgroundColor: colors.ash, borderRadius: 1, height: 20 },
    sliderSegOn: { backgroundColor: colors.bloodReel },
    sliderVal: { width: 20, textAlign: 'right', fontFamily: fonts.sub, fontSize: 12, color: colors.bone },
    pThumb: { width: 44, height: 66, backgroundColor: colors.ink, borderWidth: 1, borderColor: colors.ash, borderRadius: 2, alignItems: 'center', justifyContent: 'center' },
    pThumbActive: { backgroundColor: colors.sepia, borderColor: colors.sepia, borderWidth: 2 },
    pDefault: { fontFamily: fonts.sub, fontSize: 6.5, color: colors.fog, includeFontPadding: false },
    pImg: { width: 44, height: 66, borderRadius: 2, borderWidth: 1, borderColor: 'transparent' },
    pImgActive: { borderWidth: 2, borderColor: colors.bloodReel },
    pImgFaded: { opacity: 0.4 },
    pDefaultActive: { color: colors.ink },
    cancelColor: { color: colors.bone },

    // Physical / Locked

    // Stacks
    listChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.ash, borderRadius: 3 },
    listChipOn: { backgroundColor: colors.sepia, borderColor: colors.sepia },
    listChipText: { fontFamily: fonts.sub, fontSize: 9, color: colors.fog, maxWidth: 120, includeFontPadding: false },
    listChipTextActive: { color: colors.ink },

    // Delete (destructive → house crimson, not the bright alert red)
    deleteBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderWidth: 1, borderColor: colors.crimsonBorder, borderRadius: 4, marginBottom: 16 },
    deleteBtnText: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1, color: colors.crimson, includeFontPadding: false },
    deleteConfirm: { ...effects.shadowPrimary, shadowColor: colors.crimson, backgroundColor: 'rgba(50,0,0,0.6)', borderWidth: 1, borderColor: colors.crimson, borderRadius: 4, padding: 20, alignItems: 'center', marginBottom: 16 },
    deleteConfirmText: { fontFamily: fonts.sub, fontSize: 12, color: colors.crimson, marginBottom: 16, textAlign: 'center' },
    deleteConfirmRow: { flexDirection: 'row', gap: 12 },
    deleteYes: { flex: 1, backgroundColor: colors.crimson, paddingVertical: 12, borderRadius: 4, alignItems: 'center' },
    deleteNo: { flex: 1, borderWidth: 1, borderColor: colors.ash, paddingVertical: 12, borderRadius: 4, alignItems: 'center' },
    deleteBtnLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.parchmentBright, includeFontPadding: false },

    // Submit — SEAL THE RECORD
    submitRow: { flexDirection: 'row', gap: 12, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' },
    submitBtn: { flex: 1, backgroundColor: colors.sepia, paddingVertical: 14, borderRadius: 4, alignItems: 'center', minWidth: 180 },
    submitBtnSubmitting: { opacity: 0.7 },
    submitBtnSealed: { backgroundColor: colors.flicker },
    submitText: { fontFamily: fonts.sub, fontSize: 10, letterSpacing: 2, color: colors.ink, includeFontPadding: false },
    cancelBtn: { paddingVertical: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: colors.ash, borderRadius: 4 },
    cancelText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.fog, includeFontPadding: false },
    flatListGap: { gap: 8 },
    flatListGapPad: { gap: 8, paddingVertical: 4 },

    // Autocomplete suggestions
    autoSuggestWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
    autoSuggestItem: { backgroundColor: 'rgba(184,137,26,0.12)', borderWidth: 1, borderColor: colors.sepiaBorder, borderRadius: 3, paddingHorizontal: 10, paddingVertical: 5 },
    autoSuggestText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 1, color: colors.sepia, includeFontPadding: false },

    // ── THE DOCKET ───────────────────────────────────────────────────────────
    // Registration brackets, not a border. The Concierge card that opens this
    // screen carries the same four marks; you bracket a DOCUMENT, you do not
    // box it in — which is why the record is marked this way and the window
    // is not.
    bracketed: { position: 'relative', paddingVertical: 14, paddingHorizontal: 12, marginBottom: 4 },
    bracket: { position: 'absolute', width: 10, height: 10, borderColor: colors.sepiaBorderStrong },
    bracketTL: { top: 0, left: 0, borderLeftWidth: 1, borderTopWidth: 1 },
    bracketTR: { top: 0, right: 0, borderRightWidth: 1, borderTopWidth: 1 },
    bracketBL: { bottom: 0, left: 0, borderLeftWidth: 1, borderBottomWidth: 1 },
    bracketBR: { bottom: 0, right: 0, borderRightWidth: 1, borderBottomWidth: 1 },

    // ── THE INDEX ────────────────────────────────────────────────────────────
    // Ruled catalogue entries, not a settings list: a hairline, a name, and what
    // it holds. No chevrons — those would make it someone else's app.
    idxWrap: { marginTop: 8 },
    idxEntry: {
        flexDirection: 'row', alignItems: 'center', gap: 9,
        paddingVertical: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.sepiaBorder,
    },
    idxDot: { width: 5, height: 5, borderRadius: 2.5, borderWidth: 1 },
    idxName: { flex: 1, fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, includeFontPadding: false },
    idxValue: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 1, color: colors.fog, textAlign: 'right', maxWidth: 170, includeFontPadding: false },
    idxBody: { paddingBottom: 16 },

    // A ruled field: a line under it, never a box around it. The filing half of
    // this page was six bordered wells; a typed document has rules.
    ruledField: {
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sepiaBorder,
        paddingBottom: 9, paddingTop: 2, fontFamily: fonts.body, fontSize: 14, color: colors.parchment,
    },
    ruledRow: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
        borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.sepiaBorder, paddingBottom: 9,
    },
    ruledValue: { fontFamily: fonts.body, fontSize: 14, color: colors.parchment },
    ruledAction: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
    fieldLabel: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, marginBottom: 9, includeFontPadding: false },

    // ── THE CLEARANCE GATE ───────────────────────────────────────────────────
    gate: { alignItems: 'center', paddingTop: 16, paddingBottom: 6 },
    gateSub: { fontFamily: fonts.sub, fontSize: 8.5, letterSpacing: 3, color: colors.fog, marginBottom: 8, textAlign: 'center', includeFontPadding: false },
    gateCta: { fontFamily: fonts.sub, fontSize: 9.5, letterSpacing: 2.5, textAlign: 'center', includeFontPadding: false },
    // The instrument itself, shown but inert. `premiumLocked` above is the same
    // 0.4 the app already uses for this.
    lockedPanel: { opacity: 0.4 },

    // The Editorial Desk continues the manuscript SHEET — attached to its foot,
    // no border between them, because decorating your writing is part of writing.
    deskFoot: {
        borderWidth: 1, borderTopWidth: 0, borderColor: colors.sepiaBorder,
        borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
        backgroundColor: 'rgba(184,137,26,0.03)', paddingHorizontal: 12, paddingVertical: 11,
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10,
    },
    deskFootName: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
    deskFootText: { fontFamily: fonts.sub, fontSize: 9, letterSpacing: 2, color: colors.sepia, includeFontPadding: false },
    deskFootValue: { fontFamily: fonts.sub, fontSize: 8, letterSpacing: 1, color: colors.fog, includeFontPadding: false },
    deskBody: {
        borderWidth: 1, borderTopWidth: 0, borderColor: colors.sepiaBorder,
        borderBottomLeftRadius: 4, borderBottomRightRadius: 4,
        backgroundColor: 'rgba(184,137,26,0.03)', paddingHorizontal: 12, paddingVertical: 14,
    },

    // Delete lives past the end of the scroll now — reaching it takes intent,
    // where it used to be the FIRST thing on the page when editing a record.
    tailRow: { alignItems: 'center', gap: 16, paddingTop: 26, paddingBottom: 8 },
});
