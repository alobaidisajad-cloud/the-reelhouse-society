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
import { X, Clock, Eye, History, Lock, Archive, ChevronDown, ChevronUp, Trash2, Check, ListOrdered } from 'lucide-react-native';
import { PHYSICAL_OPTIONS, RATING_LABELS, ABANDONED_REASONS, getLocalDateString } from '@/src/hooks/useLogFlow';
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
        autopsy, altPoster, editorialHeader, dropCap, pullQuote, autopsyOpen, isAutopsied, moreOpen, calendarOpen, showDeleteConfirm, submitting,
        dispatch,
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

    const setDropCap = useCallback((v: boolean) => dispatch({ type: 'SET_FIELD', field: 'dropCap', value: v }), [dispatch]);
    const setPullQuote = useCallback((v: string) => dispatch({ type: 'SET_FIELD', field: 'pullQuote', value: v }), [dispatch]);
    const setEditorialHeader = useCallback((v: string | null) => dispatch({ type: 'SET_FIELD', field: 'editorialHeader', value: v }), [dispatch]);
    
    const setAutopsyOpen = useCallback((v: boolean) => dispatch({ type: 'SET_FIELD', field: 'autopsyOpen', value: v }), [dispatch]);
    const setIsAutopsied = useCallback((v: boolean) => dispatch({ type: 'SET_FIELD', field: 'isAutopsied', value: v }), [dispatch]);
    const setAutopsy = useCallback((v: Record<string, number>) => dispatch({ type: 'SET_FIELD', field: 'autopsy', value: v }), [dispatch]);
    const setAltPoster = useCallback((v: string | null) => dispatch({ type: 'SET_FIELD', field: 'altPoster', value: v }), [dispatch]);
    const handleUpgradePress = useCallback(() => (router.push as any)('/membership' as any), [router]);

    if (!film) return null;

    return (
        <View style={{ flex: 1 }}>
            {/* DELETE ZONE */}
            {isEditing && !showDeleteConfirm && (
                <PressableScale style={st.deleteBtn} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'showDeleteConfirm', value: true }); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="light">
                    <Trash2 size={14} color={colors.danger} />
                    <Text style={st.deleteBtnText}>DELETE THIS ENTIRE LOG</Text>
                </PressableScale>
            )}
            {showDeleteConfirm && (
                <View style={st.deleteConfirm}>
                    <Text style={st.deleteConfirmText}>DELETE THIS LOG? THIS CANNOT BE UNDONE.</Text>
                    <View style={st.deleteConfirmRow}>
                        <PressableScale style={st.deleteYes} onPress={() => { TactileEngine.destroy(); handleDelete(); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}}><Text style={st.deleteBtnLabel}>CONFIRM DELETE</Text></PressableScale>
                        <PressableScale style={st.deleteNo} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'showDeleteConfirm', value: false }); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection"><Text style={[st.deleteBtnLabel, st.cancelColor]}>CANCEL</Text></PressableScale>
                    </View>
                </View>
            )}

            {/* Film Header */}
            <View style={st.filmHeader}>
                {film.poster_path && (
                    <View>
                        <Image source={{ uri: tmdb.poster(altPoster ?? film.poster_path, 'w185') }} style={st.poster} contentFit="cover" cachePolicy="memory-disk" />
                        {altPoster && <View style={st.altBadge}><Text style={st.altBadgeText}>ALT</Text></View>}
                    </View>
                )}
                <View style={st.filmInfoCol}>
                    <Text style={st.filmTitle} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.8}>{film.title ?? film.name}</Text>
                    <Text style={st.filmYear}>{film.release_date?.slice(0, 4) || '—'}</Text>
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
                            <Text style={st.prevTakeStars}>
                                {'★'.repeat(Math.floor(previousLog.rating))}{previousLog.rating % 1 >= 0.5 ? '½' : ''}{'☆'.repeat(5 - Math.ceil(previousLog.rating))}
                            </Text>
                            <Text style={st.prevTakeRatingNum}>
                                {previousLog.rating % 1 === 0 ? previousLog.rating : previousLog.rating.toFixed(1)}/5
                            </Text>
                        </View>
                    )}
                    {previousLog.review ? (
                        <Text style={st.prevTakeReview} numberOfLines={6} adjustsFontSizeToFit minimumFontScale={0.8}>
                            {/* eslint-disable-next-line react/no-unescaped-entities */}
                            "{(previousLog.review ?? '').replace(/<[^>]+>/g, '').trim()}"
                        </Text>
                    ) : null}
                    {previousLog.watchedDate ? (
                        <Text style={st.prevTakeDate}>
                            LOGGED {new Date(previousLog.watchedDate).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })}
                        </Text>
                    ) : null}
                </Animated.View>
            )}

            {/* STATUS */}
            <View style={st.sec}>
                <SectionDivider label="STATUS" />
                <View style={st.statusRow}>
                    {(['watched', 'rewatched', 'abandoned'] as const).map(s => (
                        <PressableScale key={s} style={[st.statusBtn, status === s && st.statusActive]} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'status', value: s }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="selection">
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
                            <PressableScale key={r} style={[st.tag, abandonedReason === r && st.tagActive]} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'abandonedReason', value: r }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="selection">
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
                        <ReelRating rating={rating} size={44} onChange={(v: number) => { dispatch({ type: 'SET_FIELD', field: 'rating', value: v === rating ? 0 : v }); if (Number.isInteger(v)) { TactileEngine.mutate(); } else { TactileEngine.navigate(); } }} />
                        <View style={st.ratingFooter}>
                            {rating > 0 ? <Text style={st.ratingLabel}>{RATING_LABELS[rating] || ''}</Text> : <View />}
                            <Text style={st.ratingHint}>TAP LEFT HALF FOR ½ STARS</Text>
                        </View>
                    </View>
                </View>
            )}

            {/* MORE DETAILS Toggle */}
            <PressableScale style={st.moreToggle} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'moreOpen', value: !moreOpen }); }} haptic="selection">
                <View style={st.moreToggleInner}>
                    {moreOpen ? <ChevronUp size={14} color={colors.sepia} /> : <ChevronDown size={14} color={colors.sepia} />}
                    <Text style={st.moreText}>{moreOpen ? 'COLLAPSE DETAILS' : 'MORE DETAILS'}</Text>
                </View>
                {!moreOpen && <Text style={st.moreHint}>DATE · COMPANION · MEDIA · NOTES</Text>}
            </PressableScale>

            {/* EXPANDED DETAILS */}
            {moreOpen && (
                <Animated.View entering={FadeInDown.duration(200)}>
                    {/* Date Watched */}
                    <View style={st.sec}>
                        <View style={st.secLabelRow}>
                            <Clock size={10} color={colors.sepia} />
                            <Text style={st.secLabel}>DATE WATCHED</Text>
                        </View>
                        <View style={st.quickDateRow}>
                            <PressableScale style={[st.qDateBtn, date === todayStr && st.qDateActive]} onPress={() => { dispatch({ type: 'HYDRATE', payload: { date: todayStr, calendarOpen: false } }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="selection">
                                <Text style={[st.qDateText, date === todayStr && st.qDateTextActive]}>TODAY</Text>
                            </PressableScale>
                            <PressableScale style={[st.qDateBtn, date === yesterday && st.qDateActive]} onPress={() => { dispatch({ type: 'HYDRATE', payload: { date: yesterday, calendarOpen: false } }); }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} haptic="selection">
                                <Text style={[st.qDateText, date === yesterday && st.qDateTextActive]}>YESTERDAY</Text>
                            </PressableScale>
                        </View>
                        <PressableScale style={st.dateDisplay} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'calendarOpen', value: !calendarOpen }); }} haptic="selection">
                            <Text style={st.dateText}>{new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}</Text>
                            <Text style={[st.dateToggle, calendarOpen && st.dateToggleActive]}>{calendarOpen ? '▲ CLOSE' : '▼ CHANGE'}</Text>
                        </PressableScale>
                        {calendarOpen && <View style={st.calendarWrap}><NitrateCalendar value={date} onChange={(v) => { dispatch({ type: 'HYDRATE', payload: { date: v, calendarOpen: false } }); }} /></View>}
                    </View>

                    {/* Watched With */}
                    <View style={st.sec}>
                        <SectionDivider label="WATCHED WITH" />
                        <TextInput style={st.input} placeholder="A name, a memory, or @username..." placeholderTextColor={colors.fog} value={watchedWith} onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'watchedWith', value: v })} maxLength={60} selectionColor={'rgba(218,165,32,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} autoCorrect={false} autoCapitalize="none" keyboardAppearance="dark" accessibilityLabel="Watched with companion" />
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
                                                dispatch({ type: 'SET_FIELD', field: 'watchedWith', value: watchedWith.replace(/@[\w.]*$/, '@' + username + ' ') });
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

                    {/* Review Editor */}
                    <View style={st.sec}>
                        <SectionDivider label="REVIEW (OPTIONAL)" />
                        <TextInput testID="review-input" style={st.reviewInput} placeholder="Write your thoughts as if typing on a manuscript..." placeholderTextColor={colors.fog} value={review} onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'review', value: v })} multiline maxLength={2000} textAlignVertical="top" selectionColor={'rgba(218,165,32,0.3)'} cursorColor={colors.sepia} disableFullscreenUI={true} keyboardAppearance="dark" accessibilityLabel="Write your film review" />
                        <View style={st.reviewFooter}>
                            <PressableScale style={st.spoilerRow} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'isSpoiler', value: !isSpoiler }); }} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection">
                                <View style={[st.cbox, isSpoiler && st.cboxOn]}>{isSpoiler && <Check size={10} color={colors.ink} />}</View>
                                <Text style={st.spoilerText}>CONTAINS SPOILERS</Text>
                            </PressableScale>
                            <Text style={[st.charCount, review.length > 1800 && st.charCountWarn]}>{review.length}/2000</Text>
                        </View>
                    </View>

                    {/* Editorial Desk (Archivist+) */}
                    {isPremium && review.length > 0 && (
                        <EditorialDesk
                            dropCap={dropCap}
                            setDropCap={setDropCap}
                            pullQuote={pullQuote}
                            setPullQuote={setPullQuote}
                            editorialHeader={editorialHeader}
                            setEditorialHeader={setEditorialHeader}
                            availableBackdrops={availableBackdrops}
                        />
                    )}

                    {/* Auteur Toolkit */}
                    <AuteurToolkit
                        isAuteur={isAuteur}
                        autopsyOpen={autopsyOpen}
                        setAutopsyOpen={setAutopsyOpen}
                        isAutopsied={isAutopsied}
                        setIsAutopsied={setIsAutopsied}
                        autopsy={autopsy}
                        setAutopsy={setAutopsy}
                        availablePosters={availablePosters}
                        altPoster={altPoster}
                        setAltPoster={setAltPoster}
                        onUpgradePress={handleUpgradePress}
                    />

                    {/* Physical Media */}
                    <View style={st.sec}>
                        <View style={st.secLabelRow}>
                            <Archive size={10} color={colors.sepia} />
                            <Text style={st.secLabel}>THE PHYSICAL ARCHIVE</Text>
                        </View>
                        <View style={[st.tagRow, !isPremium && st.premiumLocked]} pointerEvents={isPremium ? 'auto' : 'none'}>
                            {PHYSICAL_OPTIONS.map(opt => (
                                <PressableScale key={opt} style={[st.tag, physicalMedia === opt && st.tagActive]} onPress={() => { dispatch({ type: 'SET_FIELD', field: 'physicalMedia', value: opt }); }} haptic="selection">
                                    <Text style={[st.tagText, physicalMedia === opt && st.tagTextActive]}>{opt}</Text>
                                </PressableScale>
                            ))}
                        </View>
                        {!isPremium && (
                            <PressableScale style={st.upgradeRow} onPress={() => (router.push as any)('/membership' as any)} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }} haptic="light">
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
                            <TextInput style={[st.reviewInput, st.privateNotesInput]} placeholder="Notes only you can see..." placeholderTextColor={colors.fog} value={privateNotes} onChangeText={(v) => dispatch({ type: 'SET_FIELD', field: 'privateNotes', value: v })} multiline maxLength={1000} textAlignVertical="top" keyboardAppearance="dark" accessibilityLabel="Private notes" selectionColor={'rgba(218,165,32,0.3)'} />
                        ) : (
                            <View style={st.lockedBox}>
                                <Lock size={20} color={colors.sepia} />
                                <PressableScale onPress={() => { (router.push as any)('/membership' as any); }} hitSlop={{top: 10, bottom: 10, left: 20, right: 20}} haptic="light">
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
                                    <PressableScale key={list.id} style={[st.listChip, isIn && st.listChipOn]} onPress={() => { toggleList(list.id); }} haptic="selection">
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

            {/* SUBMIT */}
            <View style={st.submitRow}>
                <PressableScale testID="submit-log-button" style={[st.submitBtn, submitting && st.submitBtnSubmitting]} onPress={() => { TactileEngine.mutate(); handleLog(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15}} pressedScale={0.97}>
                    <Text style={st.submitText} adjustsFontSizeToFit numberOfLines={1} minimumFontScale={0.75}>{submitting ? 'SEALING RECORD…' : (isEditing ? 'EDIT CRITIQUE' : 'CERTIFY CRITIQUE')}</Text>
                </PressableScale>
                <PressableScale style={[st.cancelBtn, submitting && { opacity: 0.5 }]} onPress={() => { router.back(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="selection">
                    <Text style={st.cancelText}>CANCEL</Text>
                </PressableScale>
                {hasUnsavedChanges && (
                    <PressableScale style={[st.cancelBtn, { marginTop: 8 }, submitting && { opacity: 0.5 }]} onPress={() => { TactileEngine.warn(); discardDraft(); router.back(); }} disabled={submitting} hitSlop={{top: 15, bottom: 15, left: 15, right: 15}} haptic="heavy">
                        <Text style={[st.cancelText, { color: colors.danger }]}>DISCARD DRAFT</Text>
                    </PressableScale>
                )}
            </View>
        </View>
    );
}
