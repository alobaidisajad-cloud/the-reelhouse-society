/**
 * Reanimated's animated Text, made from the app's Text — so an animated word
 * keeps the house ceiling and iOS's letter spacing on Android, like every other.
 *
 * Its own file on purpose: the app's Text is imported by nearly every screen,
 * and it must not pull Reanimated in with it. (Tests that mock Reanimated in
 * part could not import a single screen when it did.)
 */
import Animated from 'react-native-reanimated';
import { Text } from './index';

export const AnimatedText = Animated.createAnimatedComponent(Text);
