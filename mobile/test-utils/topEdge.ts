/**
 * topEdge — where a drawn page puts its top, read from the rendered tree.
 *
 * The page-top tests (src/components/layout/__tests__) draw each page at three
 * top insets and ask for the place whose `paddingTop` or `top` is the helper's
 * value at every one of them: the SAME place, so a number that merely happens
 * to match once does not pass.
 */
import { StyleSheet } from 'react-native';

/** No notch, the notch, the Dynamic Island. */
export const INSETS = [20, 47, 59] as const;

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/**
 * Every `paddingTop` and `top` the tree's styles set, by the place that sets it.
 * A scroller's content style counts: it is where a list's first row starts.
 */
export function topsIn(tree: unknown): { at: string; key: string; value: number }[] {
  const out: { at: string; key: string; value: number }[] = [];
  const walk = (n: Node | string | null, at: string) => {
    if (!n || typeof n === 'string') return;
    for (const prop of ['style', 'contentContainerStyle']) {
      const style = StyleSheet.flatten(n.props[prop] as never) as Record<string, unknown> | undefined;
      for (const key of ['paddingTop', 'top']) {
        const value = style?.[key];
        if (typeof value === 'number') out.push({ at, key: `${prop}.${key}`, value });
      }
    }
    (n.children ?? []).forEach((c, i) => walk(c, `${at}/${i}`));
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n, i) => walk(n as Node, `${i}`));
  return out;
}

/** The places whose top is `value`, as `place key`. */
export function placesAt(tree: unknown, value: number): Set<string> {
  return new Set(topsIn(tree).filter((t) => t.value === value).map((t) => `${t.at} ${t.key}`));
}

/** What a page puts its top at, for a failure to show: each distinct value once. */
export function topValues(tree: unknown): number[] {
  return [...new Set(topsIn(tree).map((t) => t.value))].sort((a, b) => a - b);
}
