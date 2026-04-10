import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

interface ToastOptions {
    icon?: string;
}

function triggerToast(message: string, options?: ToastOptions) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // In a full production app, this would use a dedicated Toast library.
    // For Nitrate Noir styling with current dependencies, Alert is a reliable fallback.
    Alert.alert(options?.icon ? `${options.icon} ${message}` : message);
}

const reelToast = Object.assign(triggerToast, {
    success: (msg: string) => triggerToast(msg, { icon: '✦' }),
    error: (msg: string) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Error', msg);
    },
});

export default reelToast;
