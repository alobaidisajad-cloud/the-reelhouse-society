import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronDown, Send } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import { enqueueMutation, flushOfflineQueue } from '@/src/utils/offlineQueue';
import { isNetworkError } from '@/src/utils/networkError';
import * as Crypto from 'expo-crypto';

interface DossierComment {
    id: string;
    username: string;
    body: string;
    created_at: string;
    isOptimistic?: boolean;
}

export default function DossierCritiquePanel({ dossierId, open }: { dossierId: string; open: boolean }) {
    const { user: currentUser } = useAuthStore();
    const router = useRouter();
    const [text, setText] = useState('');
    const [comments, setComments] = useState<DossierComment[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [showAll, setShowAll] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    // Callback isolation: stabilize critique input handler
    const handleTextChange = useCallback((t: string) => {
        setText(t);
    }, []);

    const [loadedDossierId, setLoadedDossierId] = useState<string | null>(null);
    const [fetchedDossierId, setFetchedDossierId] = useState<string | null>(null);
    const currentDossierIdRef = React.useRef(dossierId);
    currentDossierIdRef.current = dossierId;

    // FIX 4: View Recycling Data Bleed & Race Condition fix
    useEffect(() => {
        if (dossierId !== loadedDossierId) {
            setComments([]);
            setText('');
            setEditingId(null);
            setEditBody('');
            setLoadedDossierId(dossierId);
            setFetchedDossierId(null);
        }
        
        // Prevent zero-state database hammering
        if (open && dossierId !== fetchedDossierId) {
            setFetchedDossierId(dossierId);
            loadComments(dossierId);
        }
     
    }, [open, dossierId, loadedDossierId, fetchedDossierId]);

    const loadComments = async (targetId: string) => {
        if (!targetId) return;
        setLoading(true);
        const { data } = await supabase
            .from('dossier_comments')
            .select('id, username, body, created_at')
            .eq('dossier_id', targetId)
            .order('created_at', { ascending: true })
            .limit(50);
            
        if (currentDossierIdRef.current === targetId) {
            setComments(prev => {
                const serverComments = data || [];
                // Deduplicate optimistic comments that have successfully synced
                const optimistic = prev.filter(c => c.isOptimistic && !serverComments.some(sc => sc.username === c.username && sc.body === c.body));
                return [...serverComments, ...optimistic];
            });
            setLoading(false);
        }
    };

    const handleSubmit = async () => {
        if (!text.trim() || !currentUser || submitting) return;
        
        const tempId = Crypto.randomUUID();
        const body = text.trim();
        const tempComment: DossierComment = {
            id: tempId,
            username: currentUser.username,
            body: body,
            created_at: new Date().toISOString(),
            isOptimistic: true,
        };

        // Optimistic UI update
        setComments(prev => [...prev, tempComment]);
        setText('');
        // Clear submitting instantly to unblock rapid typing
        setSubmitting(false);

        try {
            const { error, data } = await supabase.from('dossier_comments').insert({
                dossier_id: dossierId,
                user_id: currentUser.id,
                username: currentUser.username,
                body: body,
            }).select().single();

            if (error) throw error;
            if (data) {
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                setComments(prev => prev.map(c => c.id === tempId ? { id: data.id, username: currentUser.username, body: data.body, created_at: data.created_at } : c));
                reelToast('Critique filed.');
            }
        } catch (err: any) {
            if (isNetworkError(err)) {
                enqueueMutation({
                    type: 'add_dossier_comment',
                    payload: {
                        _tempId: tempId,
                        dossier_id: dossierId,
                        user_id: currentUser.id,
                        username: currentUser.username,
                        body: body,
                    }
                });
                flushOfflineQueue();
                reelToast.success('Critique queued offline.');
            } else {
                setComments(prev => prev.filter(c => c.id !== tempId));
                setText(prev => prev.length > 0 ? prev : body);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                reelToast('Could not save critique.');
            }
        }
    };

    const handleDelete = (id: string) => {
        Alert.alert('Delete Critique?', 'Are you sure you want to permanently delete this critique?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                const removed = comments.find(c => c.id === id);
                setComments(prev => prev.filter(c => c.id !== id));
                try {
                    const { error } = await supabase.from('dossier_comments').delete().eq('id', id).eq('user_id', currentUser!.id);
                    if (error) throw error;
                    reelToast('Critique deleted.');
                } catch (err: any) {
                    if (isNetworkError(err)) {
                        enqueueMutation({
                            type: 'delete_dossier_comment',
                            payload: { comment_id: id, user_id: currentUser!.id }
                        });
                        flushOfflineQueue();
                        reelToast.success('Deletion queued offline.');
                    } else {
                        if (removed) {
                            setComments(prev => [...prev, removed].sort((a,b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
                        }
                        reelToast('Could not delete critique.');
                    }
                }
            }}
        ]);
    };

    const handleUpdate = async (id: string) => {
        if (!editBody.trim() || !currentUser) return;
        const newBody = editBody.trim();
        
        // Optimistic update
        const previousComments = [...comments];
        setComments(prev => prev.map(c => c.id === id ? { ...c, body: newBody } : c));
        setEditingId(null);
        setIsUpdating(true);

        try {
            const { error } = await supabase.from('dossier_comments').update({ body: newBody }).eq('id', id).eq('user_id', currentUser.id);
            if (error) throw error;
            reelToast('Critique updated.');
        } catch (err: any) {
            if (isNetworkError(err)) {
                enqueueMutation({
                    type: 'update_dossier_comment',
                    payload: {
                        id,
                        user_id: currentUser.id,
                        updates: { body: newBody }
                    }
                });
                flushOfflineQueue();
                reelToast.success('Update queued offline.');
            } else {
                // Rollback: Revert only this critique to avoid clobbering concurrent changes
                setComments(prev => prev.map(c => c.id === id ? previousComments.find(pc => pc.id === id)! : c));
                setEditingId(id); // FIX 5: Hard Error Edit Erasure fix
                reelToast('Could not update critique.');
            }
        } finally {
            setIsUpdating(false);
        }
    };

    if (!open) return null;

    const visibleComments = showAll ? comments : comments.slice(-3);

    return (
        <View style={s.container}>
            <Text style={s.header}>
                CRITIQUES ({comments.length})
            </Text>

            {loading && <Text style={s.loading}>RETRIEVING CRITIQUES…</Text>}

            {comments.length > 3 && !showAll && (
                <PressableScale onPress={() => (router.push as any)(`/user/${comments[0].username}` as any)} style={s.viewAllBtn} haptic="light" pressedScale={0.96}>
                    <ChevronDown size={14} color={colors.fog} />
                    <Text style={s.viewAllText}>VIEW ALL CRITIQUES</Text>
                </PressableScale>
            )}

            <View style={s.commentsList}>
                {visibleComments.map(c => (
                    <View key={c.id} style={s.commentItem}>
                        <PressableScale onPress={() => (router.push as any)(`/user/${c.username}`)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="selection" pressedScale={0.97}>
                            <Text style={s.commentUsername}>@{c.username}</Text>
                        </PressableScale>

                        {editingId === c.id ? (
                            <View style={s.editContainer}>
                                <TextInput
                                    style={s.editInput}
                                    value={editBody}
                                    onChangeText={setEditBody}
                                    multiline
                                    autoFocus
                                    maxLength={1000}
                                    keyboardAppearance="dark"
                                    accessibilityLabel="Edit critique text"
                                    selectionColor={'rgba(218,165,32,0.3)'}
                                />
                                <View style={s.editBtnRow}>
                                    <PressableScale onPress={() => setEditingId(null)} style={s.cancelBtn} haptic="light" pressedScale={0.95}>
                                        <Text style={s.cancelText}>CANCEL</Text>
                                    </PressableScale>
                                    <PressableScale 
                                        onPress={() => handleUpdate(c.id)} 
                                        disabled={isUpdating || !editBody.trim()}
                                        style={[s.updateBtn, (isUpdating || !editBody.trim()) && s.updateBtnDisabled]}
                                        haptic="medium"
                                        pressedScale={0.95}
                                    >
                                        <Text style={s.updateText}>UPDATE</Text>
                                    </PressableScale>
                                </View>
                            </View>
                        ) : (
                            <View style={s.commentBodyContainer}>
                                <Text style={s.commentBody}>{c.body}</Text>
                                {currentUser?.username === c.username && !c.isOptimistic && (
                                    <View style={s.userActions}>
                                        <PressableScale onPress={() => { setEditingId(c.id); setEditBody(c.body); }} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="selection" pressedScale={0.95}>
                                            <Text style={s.actionText}>EDIT</Text>
                                        </PressableScale>
                                        <PressableScale onPress={() => handleDelete(c.id)} hitSlop={{top: 10, bottom: 10, left: 10, right: 10}} haptic="heavy" pressedScale={0.95}>
                                            <Text style={s.deleteText}>DELETE</Text>
                                        </PressableScale>
                                    </View>
                                )}
                            </View>
                        )}
                    </View>
                ))}
            </View>

            {currentUser ? (
                <View style={s.inputContainer}>
                    <TextInput
                        style={s.input}
                        value={text}
                        onChangeText={handleTextChange}
                        placeholder="File a critique on this dossier…"
                        placeholderTextColor={colors.fog}
                        multiline
                        maxLength={1000}
                        selectionColor={'rgba(218,165,32,0.3)'}
                        keyboardAppearance="dark"
                        accessibilityLabel="Write a dossier critique"
                    />
                    <View style={s.submitRow}>
                        <PressableScale
                            onPress={handleSubmit}
                            disabled={submitting || !text.trim()}
                            style={[s.submitBtn, (submitting || !text.trim()) && s.submitBtnDisabled]}
                            haptic="medium"
                            pressedScale={0.96}
                        >
                            <Text style={s.submitText}>SUBMIT CRITIQUE</Text>
                            <Send size={14} color={colors.sepia} style={s.submitIcon} />
                        </PressableScale>
                    </View>
                </View>
            ) : (
                <Text style={s.loginPrompt}>SIGN IN TO CRITIQUE</Text>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container: {
        marginTop: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(139,105,20,0.2)',
        paddingTop: 16,
    },
    header: {
        fontFamily: fonts.display,
        fontSize: 12,
        letterSpacing: 2,
        color: colors.parchment,
        marginBottom: 16,
    },
    loading: {
        fontFamily: fonts.ui,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1.5,
        marginBottom: 12,
    },
    viewAllBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 6,
    },
    viewAllText: {
        fontFamily: fonts.ui,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1.5,
    },
    commentsList: {
        marginBottom: 8,
    },
    commentItem: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 16,
        alignItems: 'flex-start',
    },
    commentUsername: {
        fontFamily: fonts.uiMedium,
        fontSize: 11,
        letterSpacing: 1,
        color: colors.sepia,
        marginTop: 2,
    },
    commentBodyContainer: {
        flex: 1,
    },
    commentBody: {
        fontFamily: fonts.body,
        fontSize: 14,
        color: colors.bone,
        lineHeight: 22,
        borderLeftWidth: StyleSheet.hairlineWidth,
        borderLeftColor: 'rgba(139,105,20,0.3)',
        paddingLeft: 10,
    },
    userActions: {
        flexDirection: 'row',
        gap: 16,
        marginTop: 8,
    },
    actionText: {
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 1,
        color: colors.fog,
    },
    deleteText: {
        fontFamily: fonts.uiMedium,
        fontSize: 9,
        letterSpacing: 1,
        color: colors.bloodReel,
    },
    
    // Edit state
    editContainer: {
        flex: 1,
        gap: 8,
    },
    editInput: {
        width: '100%',
        backgroundColor: 'rgba(255,255,255,0.03)',
        borderWidth: 1,
        borderColor: colors.sepia,
        borderRadius: 4,
        color: colors.bone,
        fontFamily: fonts.body,
        fontSize: 14,
        padding: 12,
        minHeight: 80,
    },
    editBtnRow: {
        flexDirection: 'row',
        gap: 10,
        justifyContent: 'flex-end',
    },
    cancelBtn: {
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.2)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 2,
    },
    cancelText: {
        color: colors.fog,
        fontFamily: fonts.ui,
        fontSize: 9,
        letterSpacing: 1,
    },
    updateBtn: {
        backgroundColor: 'rgba(139,105,20,0.2)',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.3)',
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 2,
    },
    updateText: {
        color: colors.sepia,
        fontFamily: fonts.uiMedium,
        fontSize: 9,
        letterSpacing: 1,
    },

    // Input state
    inputContainer: {
        marginTop: 12,
        gap: 12,
    },
    input: {
        backgroundColor: '#030201',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: 'rgba(255,255,255,0.05)',
        borderRadius: 2,
        color: colors.bone,
        fontFamily: fonts.body,
        fontSize: 14,
        padding: 16,
        minHeight: 100,
        textAlignVertical: 'top',
        shadowColor: '#000',
        shadowOpacity: 1,
        shadowOffset: { width: 0, height: 2 },
        shadowRadius: 4,
        elevation: 2,
    },
    submitRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(139,105,20,0.1)',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.3)',
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 2,
    },
    submitText: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        color: colors.sepia,
        letterSpacing: 2,
    },
    submitIcon: { marginLeft: 8, tintColor: colors.sepia },
    submitBtnDisabled: { opacity: 0.4 },
    updateBtnDisabled: { opacity: 0.5 },
    loginPrompt: {
        fontFamily: fonts.ui,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1,
        marginTop: 12,
    },
});
