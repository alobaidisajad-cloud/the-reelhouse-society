import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import Animated, { FadeInUp, FadeOutDown } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import TactileEngine from '@/src/utils/TactileEngine';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Camera, Image as ImageIcon, X, Check } from 'lucide-react-native';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { decode } from 'base64-arraybuffer';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { supabase } from '@/src/lib/supabase';
import { useAuthStore } from '@/src/stores/auth';
import { colors, fonts } from '@/src/theme/theme';
import PressableScale from '@/src/components/PressableScale';
import reelToast from '@/src/utils/reelToast';

interface Props {
  onClose: () => void;
  onSuccess: (url: string) => void;
}

export default function AvatarCropSheet({ onClose, onSuccess }: Props) {
  const { user } = useAuthStore();
  const [uploading, setUploading] = useState(false);
  const insets = useSafeAreaInsets();

  const handlePick = async (source: 'camera' | 'library') => {
    TactileEngine.selection();

    let result;
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow camera access to take a photo.');
      result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    } else {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) return Alert.alert('Permission needed', 'Allow photo library access to pick a photo.');
      result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });
    }

    if (!result.canceled && result.assets[0]?.uri && user) {
      await processAndUpload(result.assets[0].uri);
    }
  };

  // Re-encode every chosen image before it leaves the device. This strips all
  // embedded metadata (EXIF — including GPS coordinates the photo may carry),
  // normalizes the output to a square 512px JPEG, and bounds the upload size.
  const processAndUpload = async (uri: string) => {
    setUploading(true);
    try {
      const rendered = await ImageManipulator.manipulate(uri).resize({ width: 512 }).renderAsync();
      const out = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error('Could not process the selected image.');
      TactileEngine.success();
      onSuccess(out.base64);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      if (__DEV__) console.error(msg);
      reelToast.error(msg);
      TactileEngine.error();
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      <Animated.View entering={FadeInUp.springify().damping(15)} exiting={FadeOutDown} style={[s.sheet, { paddingBottom: Math.max(insets.bottom + 20, 40) }]}>
        <View style={s.header}>
          <Text style={s.title}>UPDATE IDENTITY</Text>
          <PressableScale onPress={() => { onClose(); }} style={s.closeBtn} hitSlop={{top:15,bottom:15,left:15,right:15}} haptic="selection" pressedScale={0.9} accessibilityRole="button" accessibilityLabel="Close">
            <X size={20} color={colors.fog} />
          </PressableScale>
        </View>

        {uploading ? (
          <View style={s.uploading}>
            <ActivityIndicator size="large" color={colors.sepia} />
            <Text style={s.uploadText}>Developing in Darkroom...</Text>
          </View>
        ) : (
          <View style={s.actions}>
            <PressableScale style={s.actionCard} onPress={() => handlePick('camera')} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Take a photo with the camera">
              <View style={s.iconWrap}>
                <Camera size={24} color={colors.sepia} />
              </View>
              <Text style={s.actionText}>USE CAMERA</Text>
            </PressableScale>

            <PressableScale style={s.actionCard} onPress={() => handlePick('library')} haptic="selection" pressedScale={0.96} accessibilityRole="button" accessibilityLabel="Choose a photo from your library">
              <View style={s.iconWrap}>
                <ImageIcon size={24} color={colors.bone} />
              </View>
              <Text style={s.actionText}>LIBRARY VAULT</Text>
            </PressableScale>
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
    paddingHorizontal: 20, paddingTop: 20,
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
