/**
 * useAskBeforeLeaving — a screen holding unsaved work asks before any way out (P4.12).
 *
 * The screen's own back button asked; an edge swipe, Android's back, or a pop from anywhere else
 * left without a word and the work was gone. React Navigation stops every removal of the screen
 * while `unsaved` holds (usePreventRemove), and the member chooses: stay, or discard and leave as
 * they meant to. Nothing is asked once the work is saved or there is none.
 */
import { Alert } from 'react-native';
import { useNavigation, usePreventRemove } from 'expo-router/react-navigation';

export function useAskBeforeLeaving(unsaved: boolean, {
  title = 'Discard Changes?',
  message = 'You have unsaved changes. Are you sure you want to discard them?',
}: { title?: string; message?: string } = {}): void {
  const navigation = useNavigation();
  usePreventRemove(unsaved, ({ data }) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
}
