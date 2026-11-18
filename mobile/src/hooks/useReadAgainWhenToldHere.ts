/**
 * useReadAgainWhenToldHere — a page reads again what a notice opened over it is about.
 *
 * A push (or a notice in the sheet) about the page in front opens nothing new (pageInFront): it tells
 * the page, and the page reads again, so the critique it announced, or the ballot it says closed, is
 * on the page and not only under the bell (review round 12). `told` is handed the notice's query
 * (a salon told `door=1` opens its door). Heard only while this screen is the one in front, asked of
 * the navigator at the moment it is told (outside a navigator, nothing is in front of it, as
 * useScreenSeen answers); `told` is read then too, so a fresh one each render subscribes nothing anew.
 */
import { useContext, useEffect, useEffectEvent } from 'react';
import { NavigationContext } from 'expo-router/react-navigation';
import { listenHere } from '@/src/utils/pageInFront';

export function useReadAgainWhenToldHere(path: string | null, told: (query: URLSearchParams) => void): void {
  const navigation = useContext(NavigationContext);
  const hear = useEffectEvent(told);
  useEffect(() => {
    if (!path) return undefined;
    return listenHere(path, () => navigation?.isFocused() ?? true, (query) => hear(query));
  }, [path, navigation]);
}
