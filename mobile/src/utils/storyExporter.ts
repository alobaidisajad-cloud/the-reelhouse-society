import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import TactileEngine from '@/src/utils/TactileEngine';
import reelToast from './reelToast';
import { View } from 'react-native';

/**
 * StoryExporter — A cinematic Instagram Story export pipeline.
 * Captures an off-screen or on-screen view ref and immediately invokes the native Share sheet.
 */
export const StoryExporter = {
    /**
     * Share a captured view to Instagram / Native Share
     * @param viewRef The reference to the View to capture
     */
    shareToStory: async (viewRef: React.RefObject<View>) => {
        try {
            if (!viewRef.current) throw new Error('Ref is null');

            // 1. Capture the view as a high-res image
            const uri = await captureRef(viewRef, {
                format: 'png',
                quality: 1,
                result: 'tmpfile'
            });

            // 2. Verify sharing is available on the device
            const isAvailable = await Sharing.isAvailableAsync();
            if (!isAvailable) {
                reelToast.error('Sharing is not available on this device');
                return;
            }

            // 3. Trigger native share sheet
            await Sharing.shareAsync(uri, {
                mimeType: 'image/png',
                dialogTitle: 'Share to Instagram',
                UTI: 'public.png' // For iOS
            });

            TactileEngine.success();
        } catch (error) {
            if (__DEV__) console.error('Failed to export story:', error);
            reelToast.error('Failed to capture frame');
        }
    }
};
