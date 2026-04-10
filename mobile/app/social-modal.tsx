import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { BlurView } from 'expo-blur';
import { X, User } from 'lucide-react-native';
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { Alert } from 'react-native';

export default function SocialModal() {
    const { userId, type } = useLocalSearchParams<{ userId: string, type: 'followers' | 'following' }>();
    const [loading, setLoading] = useState(true);
    const [profiles, setProfiles] = useState<any[]>([]);

    useEffect(() => {
        if (!userId || !type) return;

        const fetchSocial = async () => {
            setLoading(true);
            try {
                let ids: string[] = [];
                if (type === 'followers') {
                    const { data } = await supabase
                        .from('interactions')
                        .select('user_id')
                        .eq('target_user_id', userId)
                        .eq('type', 'follow')
                        .limit(100);
                    ids = (data || []).map(r => r.user_id);
                } else {
                    const { data } = await supabase
                        .from('interactions')
                        .select('target_user_id')
                        .eq('user_id', userId)
                        .eq('type', 'follow')
                        .limit(100);
                    ids = (data || []).map(r => r.target_user_id);
                }

                if (ids.length > 0) {
                    const { data: profs } = await supabase
                        .from('profiles')
                        .select('id, username, avatar_url, role')
                        .in('id', ids);
                    setProfiles(profs || []);
                }
            } catch (err) {
                Alert.alert('Failed to load users');
            } finally {
                setLoading(false);
            }
        };

        fetchSocial();
    }, [userId, type]);

    const handleProfilePress = (username: string) => {
        router.back();
        // Wait for modal exit animation before pushing new route
        setTimeout(() => {
            router.push(`/user/${username}`);
        }, 300);
    };

    return (
        <BlurView intensity={90} tint="dark" style={styles.container}>
            <View style={styles.header}>
                <View style={{ width: 40 }} />
                <Text style={styles.title}>{type === 'followers' ? 'FOLLOWERS' : 'FOLLOWING'}</Text>
                <TouchableOpacity onPress={() => router.back()} style={styles.closeBtn}>
                    <X size={24} color="#F2E8A0" />
                </TouchableOpacity>
            </View>

            {loading ? (
                <View style={styles.center}>
                    <ActivityIndicator size="large" color="#8b6914" />
                </View>
            ) : profiles.length === 0 ? (
                <View style={styles.center}>
                    <Text style={styles.emptyText}>No users found.</Text>
                </View>
            ) : (
                <FlatList 
                    data={profiles}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ padding: 16 }}
                    renderItem={({ item }) => (
                        <TouchableOpacity style={styles.userRow} onPress={() => handleProfilePress(item.username)}>
                            {item.avatar_url && item.avatar_url.startsWith('http') ? (
                                <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                            ) : (
                                <View style={styles.avatarPlaceholder}><User size={20} color="#F2E8A0" /></View>
                            )}
                            <View style={styles.userInfo}>
                                <Text style={styles.username}>@{item.username.toUpperCase()}</Text>
                                <Text style={styles.role}>{item.role.toUpperCase()}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                />
            )}
        </BlurView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: 60,
        paddingBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(139,105,20,0.2)',
    },
    title: {
        fontFamily: 'Inter-Medium',
        fontSize: 12,
        letterSpacing: 4,
        color: '#8b6914',
    },
    closeBtn: {
        width: 40,
        height: 40,
        alignItems: 'flex-end',
        justifyContent: 'center',
    },
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    emptyText: {
        fontFamily: 'Inter-Regular',
        fontSize: 14,
        color: 'rgba(255,255,255,0.5)',
    },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: 'rgba(255,255,255,0.05)',
    },
    avatar: {
        width: 48,
        height: 48,
        borderRadius: 24,
    },
    avatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 24,
        backgroundColor: 'rgba(139,105,20,0.2)',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'rgba(139,105,20,0.4)',
    },
    userInfo: {
        marginLeft: 16,
        flex: 1,
    },
    username: {
        fontFamily: 'Outfit-Medium',
        fontSize: 18,
        color: '#F2E8A0',
        marginBottom: 2,
    },
    role: {
        fontFamily: 'Inter-Regular',
        fontSize: 10,
        letterSpacing: 1,
        color: 'rgba(255,255,255,0.5)',
    }
});
