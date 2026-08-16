import React, { useMemo, useCallback } from 'react';
import { View, Text, TextInput, ScrollView } from 'react-native';

import { Image } from 'expo-image';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import TactileEngine from '@/src/utils/TactileEngine';
import { useRouter } from 'expo-router';
import { colors } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { tmdb } from '@/src/lib/tmdb';
import { ReelRating, SectionDivider } from '@/src/components/Decorative';
import NitrateCalendar from '@/src/components/NitrateCalendar';
import EditorialDesk from '@/src/components/log/EditorialDesk';
import AuteurToolkit from '@/src/components/log/AuteurToolkit';
import { X, Clock, Eye, History, Lock, Archive, ChevronDown, ChevronUp, Trash2, Check, ListOrdered, Feather } from 'lucide-react-native';
import { PHYSICAL_OPTIONS, RATING_LABELS, ABANDONED_REASONS, getLocalDateString } from '@/src/hooks/useLogFlow';
import { stripHTML, isRTLText } from '@/src/utils/text';
import { dateParts, formatDate, formatLongCalendarDate } from '@/src/utils/timeAgo';
import { scaledTextProps, displayTextProps } from '@/src/constants/textScaling';
import { st } from './LogModalStyles';
import type { useLogFlow } from '@/src/hooks/useLogFlow';
import { useSocialStore } from '@/src/stores/followStore';

import type { User } from '@/src/types';

interface LogFormProps {
    flow: ReturnType<typeof useLogFlow>;
    user: User | null; // From useAuthStore
}

export default function LogForm({ flow, user }: LogFormProps) {
    const router = useRouter();
  const following = useSocialStore(s => s.following);
    const {
        isAuteur,
        isPremium,
        film,
        status, rating, review, isSpoiler, abandonedReason, date, watchedWith, privateNotes, physicalMedia,
        autopsy, altPoster, editorialHeader, dropCap, pullQuote, autopsyOpen, moreOpen, calendarOpen, showDeleteConfirm, submitting, sealed,
        // Typed field setters from useLogFlow — these replace the removed
        // `dispatch` compatibility shim (which silently dropped every field
        // except the 6 premium ones). Using the setters directly restores the
        // core form (status/rating/review/date/…) and is compile-time checked.
        setStatus, setRating, setReview, setIsSpoiler, setAbandonedReason,
        setDate, setWatchedWith, setPrivateNotes, setPhysicalMedia,
        setMoreOpen, setCalendarOpen, setShowDeleteConfirm,
        setDropCap, setPullQuote, setEditorialHeader,
        setAutopsyOpen, setAutopsy, setAltPoster,
        isRewatchMode, previousLog,
        availablePosters, availableBackdrops,
        isEditing,
        handleLog,
        handleDelete,
        discardDraft,
        hasUnsavedChanges,
        toggleList,
        lists
    } = flow;

    const yesterday = useMemo(() => getLocalDateString(-1), []);
    const todayStr = useMemo(() => getLocalDateString(0), []);
    const deskName = (user?.username || 'you').toUpperCase();

    /**
     * The Society page, reached WITHOUT stacking a modal on a modal.
     *
     * `(modals)/membership` is `presentation: 'modal'` and so is this screen, and
     * this form pushed straight to it from three places. On iOS that is a modal
     * over a modal — the same trap the floating button hit, whose fix became the
     * Concierge's law: park the destination, dismiss, then travel.
     *
     * The draft is already saved by useLogFlow, so a member who goes to look at
     * the ranks comes back to their words.
     */
    const goToSociety = useCallback(() => {
        TactileEngine.selection();
        router.back();
        // One frame after the dismissal begins, so the sheet is on its way out
        // before the next one is asked for.
        requestAnimationFrame(() => { (router.push as any)('/membership' as any); });
    }, [router]);
    const handleUpgradePress = goToSociety;

    if (!film) return null;

    return (
        <View style={{ flex: 1 }}>
            {/* DELETE ZONE */}
            {isEditing && !showDeleteConfirm && (
                <PressableScale style={st.deleteBtn} onPress={() => { setShowDeleteConfirm(true); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light">
                    <Trash2 size={14} color={colors.crimson} />
                    <Text style={st.deleteBtnText}>DELETE THIS ENTIRE LOG</Text>
                </PressableScale>
            )}
            {showDeleteConfirm && (
                <View style={st.deleteConfirm}>
                    <Text style={st.deleteConfirmText}>DELETE THIS LOG? THIS CANNOT BE UNDONE.</Text>
                    <View style={st.deleteConfirmRow}>
                        <PressableScale style={st.deleteYes} onPress={() => { TactileEngine.destroy(); handleDelete(); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}><Text style={st.deleteBtnLabel}>CONFIRM DELETE</Text></PressableScale>
                        <PressableScale style={st.deleteNo} onPress={() => { setShowDeleteConfirm(false); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection"><Text style={[st.deleteBtnLabel, st.cancelColor]}>CANCEL</Text></PressableScale>
                    </View>
                </View>
            )}

            {/* Film Header */}
            <View style={st.filmHeader}>
                {film.poster_path && (
                    <View>
                        <Image source={{ uri: tmdb.poster(altPoster ?? film.poster_path, 'w185') }} style={st.poster} contentFit="cover" cachePolicy="memory-disk" transition={150} />
                        {altPoster && <View style={st.altBadge}><Text style={st.altBadgeText}>ALT</Text></View>}
                    </View>
                )}
                <View style={st.filmInfoCol}>
                    <Text style={st.filmTitle} {...displayTextProps} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>{film.title ?? film.name}</Text>
                    {film.release_date ? (
                        <Text style={st.filmYear}>{film.release_date.slice(0, 4)}</Text>
                    ) : null}
                </View>
            </View>

            {/* Previous Take (Rewatch context) */}
            {isRewatchMode && previousLog && (
                <Animated.View entering={FadeInDown.delay(100).duration(400)} style={st.prevTakeBox}>
                    <View style={st.prevTakeHeader}>
                        <History size={11} color={colors.sepia} />
                        <Text style={st.prevTakeLabel}>YOUR PREVIOUS TAKE</Text>
                        {(previousLog.viewCount || 1) > 1 && (
                            <View style={st.prevTakeCountBadge}>
                                <Text style={st.prevTakeCountText}>VIEWING {previousLog.viewCount || 1}</Text>
                            </View>
                        )}
                    </View>
                    {previousLog.rating > 0 && (
                        <View style={st.prevTakeRatingRow}>
                            <ReelRating rating={previousLog.rating} size={13} />
                            <Text style={st.prevTakeRatingNum}>
                                {previousLog.rating % 1 === 0 ? previousLog.rating : previousLog.rating.toFixed(1)}/5
                            </Text>
                        </View>
                    )}
                    {previousLog.review ? (
                        // stripHTML, not a fourth private copy of it. The one that
                        // lived here was `replace(/<[^>]+>/g, '')` — the same total
                        // strip that ate a member's own angle brackets on the record,
                        // so `<The Batman> again` lost its first two words when their
                        // previous take was quoted back to them.
                        <Text style={[st.prevTakeReview, isRTLText(previousLog.review) && st.rtlText]} {...scaledTextProps} numberOfLines={6}>
                            &ldquo;{stripHTML(previousLog.review)}&rdquo;
                        </Text>
                    ) : null}
                    {!!dateParts(previousLog.watchedDate) ? (
                        // A calendar day, formatted from the app's month table. It was
                        // going through `new Date(...).toLocaleDateString(… timeZone:
                        // 'UTC' …)`, and Hermes ships here with no Intl polyfill — so
                        // if that option is ignored the whole of the Americas reads
                        // the day before.
                        <Text style={st.prevTakeDate}>
                            LOGGED {formatDate(previousLog.watchedDate)}
                        </Text>
                    ) : null}
                </Animated.View>
            )}

            {/* STATUS */}
            <View style={st.sec}>
                <SectionDivider label="STATUS" />
                <View style={st.statusRow}>
                    {(['watched', 'rewatched', 'abandoned'] as const).map(s => (
                        <PressableScale key={s} style={[st.statusBtn, status === s && st.statusActive]} onPress={() => { setStatus(s); }} hitSlop={{ top: 10, bottom: 10, left: 4, right: 4 }} accessibilityRole="button" accessibilityState={{ selected: status === s }} accessibilityLabel={s} haptic="selection">
                            {s === 'watched' && <Eye size={14} color={status === s ? colors.ink : colors.fog} />}
                            {s === 'rewatched' && <History size={14} color={status === s ? colors.ink : colors.fog} />}
                            {s === 'abandoned' && <X size={14} color={status === s ? colors.ink : colors.fog} />}
                            <Text style={[st.statusText, status === s && st.statusTextActive]}>{s.toUpperCase()}</Text>
                        </PressableScale>
                    ))}
                </View>
            </View>

            {/* ABANDONED REASON */}
            {status === 'abandoned' && (
                <View style={st.sec}>
                    <SectionDivider label="REASON" />
                    <View style={st.tagRow}>
                        {ABANDONED_REASONS.map((r: string) => (
                            <PressableScale key={r} style={[st.tag, abandonedReason === r && st.tagActive]} onPress={() => { setAbandonedReason(r); }} hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }} accessibilityRole="button" accessibilityState={{ selected: abandonedReason === r }} accessibilityLabel={r} haptic="selection">
                                <Text style={[st.tagText, abandonedReason === r && st.tagTextActive]}>{r}</Text>
                            </PressableScale>
                        ))}
                    </View>
                </View>
            )}

            {/* RATING */}
            {status !== 'abandoned' && (
                <View style={st.sec}>
                    <View style={st.ratingHeader}>
                        <Text style={st.secLabel}>YOUR RATING</Text>
                        {rating > 0 && (
                            <Text style={st.ratingValue}>{rating % 1 === 0 ? rating : rating.toFixed(1)}<Text style={st.ratingMax}>/5</Text></Text>
                        )}
                    </View>
                    <View style={st.ratingBody}>
                        <ReelRating rating={rating} size={44} onChange={(v: number) => { setRating(v === rating ? 0 : v); if (Number.isInteger(v)) { TactileEngine.mutate(); } else { TactileEngine.navigate(); } }} />
                        <View style={st.ratingFooter}>
                            {rating > 0 ? <Text style={st.ratingLabel}>{RATING_LABELS[rating] || ''}</Text> : <View />}
                            <Text style={st.ratingHint}>TAP LEFT HALF FOR ½ REELS</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* THE MANUSCRIPT — the review is the hero, always visible */}
            <View style={st.sec}>
                <View style={st.manuscriptFrame}>
                    <View style={st.manuscriptHeader}>
                        <Feather size={9} color={colors.sepia} strokeWidth={1.5} />
                        <Text style={st.manuscriptHeaderText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                            ✦ THE MANUSCRIPT — FROM THE DESK OF @{deskName}
                        </Text>
                    </View>
                    <TextInput testID="review-input" style={st.reviewInput} placeholder="Write your thoughts as if typing on a manuscript..." placeholderTextColor={colors.fog} value={review} onChangeText={setReview} multiline maxLength={2000} textAlignVertical="top" {...scaledTextProps} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} keyboardAppearance="dark" accessibilityLabel="Write your film review" />
                    <View style={st.reviewFooter}>
                        <PressableScale style={st.spoilerRow} onPress={() => { setIsSpoiler(!isSpoiler); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection">
                            <View style={[st.cbox, isSpoiler && st.cboxOn]}>{isSpoiler && <Check size={10} color={colors.ink} />}</View>
                            <Text style={st.spoilerText}>CONTAINS SPOILERS</Text>
                        </PressableScale>
                        <Text style={[st.charCount, review.length > 1800 && st.charCountWarn]}>{review.length}/2000</Text>
                    </View>
                </View>
            </View>

            {/* Editorial Desk (Archivist+). Non-premium members see a LOCKED
                teaser — the velvet-rope law: every premium feature is visible
                behind glass (like Physical Archive and Private Notes below),
                never an invisible door. */}
            {isPremium ? (
                <Animated.View entering={FadeInDown.duration(200)}>
                    <EditorialDesk
                        dropCap={dropCap}
                        setDropCap={setDropCap}
                        pullQuote={pullQuote}
                        setPullQuote={setPullQuote}
                        editorialHeader={editorialHeader}
                        setEditorialHeader={setEditorialHeader}
                        availableBackdrops={availableBackdrops}
                    />
                </Animated.View>
            ) : (
                <View style={st.sec}>
                    <View style={st.secLabelRow}>
                        <Feather size={10} color={colors.sepia} />
                        <Text style={st.secLabel}>THE EDITORIAL DESK</Text>
                    </View>
                    <View style={[st.lockedBox, st.editorialTeaser]}>
                        <Lock size={20} color={colors.sepia} />
                        <Text style={st.editorialTeaserText} {...scaledTextProps}>
                            Drop caps, pull quotes, and article headers{'\n'}for published critiques.
                        </Text>
                        <PressableScale onPress={handleUpgradePress} hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }} haptic="light" accessibilityRole="button" accessibilityLabel="Unlock the Editorial Desk with Archivist">
                            <Text style={st.lockedText}>UNLOCK WITH ARCHIVIST</Text>
                        </PressableScale>
                    </View>
                </View>
            )}

            {/* Auteur Toolkit — the deep craft autopsy */}
            <AuteurToolkit
                isAuteur={isAuteur}
                autopsyOpen={autopsyOpen}
                setAutopsyOpen={setAutopsyOpen}
                autopsy={autopsy}
                setAutopsy={setAutopsy}
                availablePosters={availablePosters}
                altPoster={altPoster}
                setAltPoster={setAltPoster}
                onUpgradePress={handleUpgradePress}
            />

            {/* LOGISTICS — the fine print, collapsed by default */}
            <PressableScale style={st.moreToggle} onPress={() => { setMoreOpen(!moreOpen); }} haptic="selection">
                <View style={st.moreToggleInner}>
                    {moreOpen ? <ChevronUp size={14} color={colors.sepia} /> : <ChevronDown size={14} color={colors.sepia} />}
                    <Text style={st.moreText}>{moreOpen ? 'COLLAPSE LOGISTICS' : 'THE LOGISTICS'}</Text>
                </View>
                {!moreOpen && <Text style={st.moreHint}>DATE · COMPANION · MEDIA · NOTES</Text>}
            </PressableScale>

            {moreOpen && (
                <Animated.View entering={FadeInDown.duration(200)}>
                    {/* Date Watched */}
                    <View style={st.sec}>
                        <View style={st.secLabelRow}>
                            <Clock size={10} color={colors.sepia} />
                            <Text style={st.secLabel}>DATE WATCHED</Text>
                        </View>
                        <View style={st.quickDateRow}>
                            <PressableScale style={[st.qDateBtn, date === todayStr && st.qDateActive]} onPress={() => { setDate(todayStr); setCalendarOpen(false); }} hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }} accessibilityRole="button" accessibilityState={{ selected: date === todayStr }} accessibilityLabel="Watched today" haptic="selection">
                                <Text style={[st.qDateText, date === todayStr && st.qDateTextActive]}>TODAY</Text>
                            </PressableScale>
                            <PressableScale style={[st.qDateBtn, date === yesterday && st.qDateActive]} onPress={() => { setDate(yesterday); setCalendarOpen(false); }} hitSlop={{ top: 10, bottom: 10, left: 3, right: 3 }} accessibilityRole="button" accessibilityState={{ selected: date === yesterday }} accessibilityLabel="Watched yesterday" haptic="selection">
                                <Text style={[st.qDateText, date === yesterday && st.qDateTextActive]}>YESTERDAY</Text>
                            </PressableScale>
                        </View>
                        <PressableScale style={st.dateDisplay} onPress={() => { setCalendarOpen(!calendarOpen); }} haptic="selection">
                            {/* Same rule: no Intl. `formatLongCalendarDate` reads the
                                parts straight out of the YYYY-MM-DD string and renders
                                from the app's own month and weekday tables — the noon
                                anchor above was there to dodge a timezone shift that
                                now cannot happen. */}
                            <Text style={st.dateText}>{formatLongCalendarDate(date)}</Text>
                            <Text style={[st.dateToggle, calendarOpen && st.dateToggleActive]}>{calendarOpen ? '▲ CLOSE' : '▼ CHANGE'}</Text>
                        </PressableScale>
                        {calendarOpen && <View style={st.calendarWrap}><NitrateCalendar value={date} onChange={(v) => { setDate(v); setCalendarOpen(false); }} /></View>}
                    </View>

                    {/* Watched With */}
                    <View style={st.sec}>
                        <SectionDivider label="WATCHED WITH" />
                        <TextInput style={st.input} placeholder="A name, a memory, or @username..." placeholderTextColor={colors.fog} value={watchedWith} onChangeText={setWatchedWith} maxLength={60} selectionColor={'rgba(220,166,58,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} autoCorrect={false} autoCapitalize="none" keyboardAppearance="dark" accessibilityLabel="Watched with companion" />
                        {(watchedWith || '').includes('@') && following && following.length > 0 && (() => {
                            const atMatch = watchedWith.match(/@([\w.]*)$/);
                            if (!atMatch) return null;
                            const partial = atMatch[1].toLowerCase();
                            const matches = following.filter((u: string) => u.toLowerCase().startsWith(partial)).slice(0, 4);
                            if (matches.length === 0) return null;
                            return (
                                <Animated.View entering={FadeIn.duration(150)} style={st.autoSuggestWrap}>
                                    {matches.map((username: string) => (
                                        <PressableScale
                                            key={username}
                                            style={st.autoSuggestItem}
                                            onPress={() => {
                                                setWatchedWith(watchedWith.replace(/@[\w.]*$/, '@' + username + ' '));
                                            }}
                                            haptic="selection"
                                        >
                                            <Text style={st.autoSuggestText}>@{username}</Text>
                                        </PressableScale>
                                    ))}
                                </Animated.View>
                            );
                        })()}
                    </View>

                    {/* Physical Media */}
                    <View style={st.sec}>
                        <View style={st.secLabelRow}>
                            <Archive size={10} color={colors.sepia} />
                            <Text style={st.secLabel}>THE PHYSICAL ARCHIVE</Text>
                        </View>
                        <View style={[st.tagRow, !isPremium && st.premiumLocked]} pointerEvents={isPremium ? 'auto' : 'none'}>
                            {PHYSICAL_OPTIONS.map(opt => (
                                <PressableScale key={opt} style={[st.tag, physicalMedia === opt && st.tagActive]} onPress={() => { setPhysicalMedia(opt); }} hitSlop={{ top: 3, bottom: 3, left: 3, right: 3 }} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: physicalMedia === opt }} accessibilityLabel={opt}>
                                    <Text style={[st.tagText, physicalMedia === opt && st.tagTextActive]}>{opt}</Text>
                                </PressableScale>
                            ))}
                        </View>
                        {!isPremium && (
                            <PressableScale style={st.upgradeRow} onPress={goToSociety} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light">
                                <Lock size={10} color={colors.sepia} /><Text style={st.upgradeRowText}>UNLOCK WITH ARCHIVIST</Text>
                            </PressableScale>
                        )}
                    </View>

                    {/* Private Notes */}
                    <View style={st.sec}>
                        <View style={st.secLabelRow}>
                            <Lock size={10} color={colors.sepia} />
                            <Text style={st.secLabel}>PRIVATE NOTES (THE CUTTING ROOM FLOOR)</Text>
                        </View>
                        {isPremium ? (
                            <TextInput style={[st.reviewInput, st.privateNotesInput]} placeholder="Notes only you can see..." placeholderTextColor={colors.fog} value={privateNotes} onChangeText={setPrivateNotes} multiline maxLength={1000} textAlignVertical="top" {...scaledTextProps} keyboardAppearance="dark" accessibilityLabel="Private notes" selectionColor={'rgba(220,166,58,0.3)'} />
                        ) : (
                            <View style={st.lockedBox}>
                                <Lock size={20} color={colors.sepia} />
                                <PressableScale onPress={goToSociety} hitSlop={{top: 10, bottom: 10, left: 20, right: 20}} haptic="light">
                                    <Text style={st.lockedText}>UNLOCK WITH ARCHIVIST</Text>
                                </PressableScale>
                            </View>
                        )}
                    </View>
                </Animated.View>
            )}

            {/* ADD TO STACK */}
            {lists.length > 0 && (
                <View style={st.sec}>
                    <Text style={st.secLabel}>ADD TO STACK</Text>
                    <View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.flatListGapPad}>
                            {lists.map((list: any) => {
                                const isIn = list.films.some((f: any) => f.id === film.id);
                                return (
                                    <PressableScale key={list.id} style={[st.listChip, isIn && st.listChipOn]} onPress={() => { toggleList(list.id); }} hitSlop={{ top: 15, bottom: 15, left: 4, right: 4 }} haptic="selection" accessibilityRole="button" accessibilityState={{ selected: isIn }} accessibilityLabel={list.title}>
                                        {isIn && <Check size={12} color={colors.ink} />}
                                        {list.isPrivate && <Lock size={10} color={isIn ? colors.ink : colors.fog} />}
                                        {list.isRanked && <ListOrdered size={10} color={isIn ? colors.ink : colors.fog} />}
                                        <Text style={[st.listChipText, isIn && st.listChipTextActive]} numberOfLines={1}>{list.title}</Text>
                                    </PressableScale>
                                );
                            })}
                            <View style={{ width: 20 }} />
                        </ScrollView>
                    </View>
                </View>
            )}

            {/* SEAL THE RECORD */}
            <View style={st.submitRow}>
                <PressableScale testID="submit-log-button" style={[st.submitBtn, submitting && st.submitBtnSubmitting, sealed && st.submitBtnSealed]} onPress={() => { TactileEngine.mutate(); handleLog(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15}} pressedScale={0.97}>
                    <Text style={st.submitText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>{sealed ? '✦ RECORD SEALED' : submitting ? 'SEALING RECORD…' : (isEditing ? 'RESEAL THE RECORD' : 'SEAL THE RECORD')}</Text>
                </PressableScale>
                <PressableScale style={[st.cancelBtn, submitting && { opacity: 0.5 }]} onPress={() => { router.back(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection">
                    <Text style={st.cancelText}>CANCEL</Text>
                </PressableScale>
                {hasUnsavedChanges && (
                    <PressableScale style={[st.cancelBtn, { marginTop: 8 }, submitting && { opacity: 0.5 }]} onPress={() => { TactileEngine.warn(); discardDraft(); router.back(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="heavy">
                        <Text style={[st.cancelText, { color: colors.crimson }]}>DISCARD DRAFT</Text>
                    </PressableScale>
                )}
            </View>
        </View>
    );
}
