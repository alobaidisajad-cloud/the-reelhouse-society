import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { ChevronDown, Send } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import reelToast from '@/src/utils/reelToast';
import { colors, fonts } from '@/src/theme/theme';

export default function DossierCritiquePanel({ dossierId, open }: { dossierId: string; open: boolean }) {
    const { user: currentUser } = useAuthStore();
    const router = useRouter();
    const [text, setText] = useState('');
    const [comments, setComments] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showAll, setShowAll] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editBody, setEditBody] = useState('');
    const [isUpdating, setIsUpdating] = useState(false);

    useEffect(() => {
        if (open && comments.length === 0) loadComments();
    }, [open]);

    const loadComments = async () => {
        if (!dossierId) return;
        setLoading(true);
        const { data } = await supabase
            .from('dossier_comments')
            .select('id, username, body, created_at')
            .eq('dossier_id', dossierId)
            .order('created_at', { ascending: true })
            .limit(50);
        setComments(data || []);
        setLoading(false);
    };

    const handleSubmit = async () => {
        if (!text.trim() || !currentUser || submitting) return;
        setSubmitting(true);
        const { error, data } = await supabase.from('dossier_comments').insert({
            dossier_id: dossierId,
            user_id: currentUser.id,
            username: currentUser.username,
            body: text.trim(),
        }).select().single();

        if (!error && data) {
            setComments(prev => [...prev, { id: data.id, username: currentUser.username, body: text.trim(), created_at: new Date().toISOString() }]);
            setText('');
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            reelToast('Critique filed.');
        } else {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            reelToast('Could not save critique.');
        }
        setSubmitting(false);
    };

    const handleDelete = (id: string) => {
        Alert.alert('Delete Critique?', 'Are you sure you want to permanently delete this critique?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
                const { error } = await supabase.from('dossier_comments').delete().eq('id', id);
                if (!error) {
                    setComments(prev => prev.filter(c => c.id !== id));
                    reelToast('Critique deleted.');
                } else {
                    reelToast('Could not delete critique.');
                }
            }}
        ]);
    };

    const handleUpdate = async (id: string) => {
        if (!editBody.trim()) return;
        setIsUpdating(true);
        const { error } = await supabase.from('dossier_comments').update({ body: editBody.trim() }).eq('id', id);
        if (!error) {
            setComments(prev => prev.map(c => c.id === id ? { ...c, body: editBody.trim() } : c));
            setEditingId(null);
            reelToast('Critique updated.');
        } else {
            reelToast('Could not update critique.');
        }
        setIsUpdating(false);
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
                <TouchableOpacity onPress={() => setShowAll(true)} style={s.viewAllBtn} activeOpacity={0.6}>
                    <ChevronDown size={14} color={colors.fog} />
                    <Text style={s.viewAllText}>VIEW ALL CRITIQUES</Text>
                </TouchableOpacity>
            )}

            <View style={s.commentsList}>
                {visibleComments.map(c => (
                    <View key={c.id} style={s.commentItem}>
                        <TouchableOpacity onPress={() => router.push(`/user/${c.username}`)}>
                            <Text style={s.commentUsername}>@{c.username}</Text>
                        </TouchableOpacity>

                        {editingId === c.id ? (
                            <View style={s.editContainer}>
                                <TextInput
                                    style={s.editInput}
                                    value={editBody}
                                    onChangeText={setEditBody}
                                    multiline
                                    autoFocus
                                />
                                <View style={s.editBtnRow}>
                                    <TouchableOpacity onPress={() => setEditingId(null)} style={s.cancelBtn}>
                                        <Text style={s.cancelText}>CANCEL</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity 
                                        onPress={() => handleUpdate(c.id)} 
                                        disabled={isUpdating || !editBody.trim()}
                                        style={[s.updateBtn, (isUpdating || !editBody.trim()) && { opacity: 0.5 }]}
                                    >
                                        <Text style={s.updateText}>UPDATE</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={s.commentBodyContainer}>
                                <Text style={s.commentBody}>{c.body}</Text>
                                {currentUser?.username === c.username && (
                                    <View style={s.userActions}>
                                        <TouchableOpacity onPress={() => { setEditingId(c.id); setEditBody(c.body); }}>
                                            <Text style={s.actionText}>EDIT</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => handleDelete(c.id)}>
                                            <Text style={s.deleteText}>DELETE</Text>
                                        </TouchableOpacity>
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
                        onChangeText={setText}
                        placeholder="File a critique on this dossier…"
                        placeholderTextColor={colors.fog}
                        multiline
                    />
                    <View style={s.submitRow}>
                        <TouchableOpacity
                            onPress={handleSubmit}
                            disabled={submitting || !text.trim()}
                            style={[s.submitBtn, (submitting || !text.trim()) && { opacity: 0.4 }]}
                        >
                            <Text style={s.submitText}>SUBMIT CRITIQUE</Text>
                            <Send size={14} color={colors.ink} style={{ marginLeft: 6 }} />
                        </TouchableOpacity>
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
        fontFamily: fonts.ui,
        fontSize: 10,
        letterSpacing: 2,
        color: colors.sepia,
        marginBottom: 12,
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
        backgroundColor: 'rgba(10,7,3,0.5)',
        borderWidth: 1,
        borderColor: colors.ash,
        borderRadius: 4,
        color: colors.bone,
        fontFamily: fonts.sub,
        fontSize: 15,
        padding: 12,
        minHeight: 90,
        textAlignVertical: 'top',
    },
    submitRow: {
        flexDirection: 'row',
        justifyContent: 'flex-end',
    },
    submitBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.sepia,
        paddingVertical: 10,
        paddingHorizontal: 16,
        borderRadius: 4,
    },
    submitText: {
        fontFamily: fonts.uiBold,
        fontSize: 10,
        color: colors.ink,
        letterSpacing: 2,
    },
    loginPrompt: {
        fontFamily: fonts.ui,
        fontSize: 10,
        color: colors.fog,
        letterSpacing: 1,
        marginTop: 12,
    },
});
