import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import * as Haptics from 'expo-haptics';
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react-native';
import { decode } from 'base64-arraybuffer';

import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';

interface Props {
  onClose: () => void;
  onSuccess: (url: string) => void;
}

export default function AvatarCropSheet({ onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const [uploading, setUploading] = useState(false);

  const handlePick = async (source: 'camera' | 'library') => {
    Haptics.selectionAsync();

    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow photo library access to pick a photo.');
      result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.5,
        base64: true,
      });
    }

    if (!result.canceled && result.assets[0].base64 && user) {
      await uploadAvatar(result.assets[0].base64);
    }
  };

  const uploadAvatar = async (base64Str: string) => {
    setUploading(true);
    try {
      const filePath = `${user!.id}/${Date.now()}.jpg`;
      const { data, error } = await supabase.storage.from('avatars').upload(filePath, decode(base64Str), {
        contentType: 'image/jpeg',
      });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;

      // Update profile
      const { error: profileError } = await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user!.id);
      if (profileError) throw profileError;

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onSuccess(publicUrl);
    } catch (err: any) {
      console.error(err);
      Alert.alert('Upload Failed', err.message);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View entering={FadeInUp.springify().damping(15)} exiting={FadeOutDown} style={s.sheet}>
        <View style={s.header}>
          <Text style={s.title}>UPDATE IDENTITY</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <X size={20} color={colors.fog} />
          </TouchableOpacity>
        </View>

        {uploading ? (
          <View style={s.uploading}>
            <ActivityIndicator size="large" color={colors.sepia} />
            <Text style={s.uploadText}>Developing in Darkroom...</Text>
          </View>
        ) : (
          <View style={s.actions}>
            <TouchableOpacity style={s.actionCard} onPress={() => handlePick('camera')} activeOpacity={0.8}>
              <View style={s.iconWrap}>
                <Camera size={24} color={colors.sepia} />
              </View>
              <Text style={s.actionText}>USE CAMERA</Text>
            </TouchableOpacity>

            <TouchableOpacity style={s.actionCard} onPress={() => handlePick('library')} activeOpacity={0.8}>
              <View style={s.iconWrap}>
                <ImageIcon size={24} color={colors.bone} />
              </View>
              <Text style={s.actionText}>LIBRARY VAULT</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: colors.soot, borderTopLeftRadius: 16, borderTopRightRadius: 16,
    paddingHorizontal: 20, paddingBottom: 40, paddingTop: 20,
    borderTopWidth: 1, borderTopColor: 'rgba(139,105,20,0.2)',
    shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.8, shadowRadius: 20,
  },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  title: { fontFamily: fonts.display, fontSize: 16, color: colors.parchment, letterSpacing: 1 },
  closeBtn: { padding: 4 },
  actions: { flexDirection: 'row', gap: 16 },
  actionCard: {
    flex: 1, backgroundColor: colors.ink, borderRadius: 8, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: colors.ash,
  },
  iconWrap: { width: 50, height: 50, borderRadius: 25, backgroundColor: 'rgba(139,105,20,0.1)', justifyContent: 'center', alignItems: 'center', marginBottom: 12 },
  actionText: { fontFamily: fonts.uiBold, fontSize: 10, letterSpacing: 1.5, color: colors.bone },
  uploading: { alignItems: 'center', paddingVertical: 40 },
  uploadText: { fontFamily: fonts.sub, fontSize: 14, color: colors.sepia, marginTop: 16, fontStyle: 'italic' },
});
