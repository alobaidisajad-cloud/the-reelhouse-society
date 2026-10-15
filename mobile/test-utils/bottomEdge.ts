/**
 * bottomEdge — where a drawn page puts its foot, read from the rendered tree.
 *
 * The page-foot tests (src/components/layout/__tests__) draw each page at three
 * bottom insets and ask for the place whose `paddingBottom` or `bottom` is the
 * helper's value at every one of them: the SAME place, so a number that merely
 * happens to match once does not pass. topEdge.ts does the same for the top.
 */
import { StyleSheet } from 'react-native';

/** An iPhone SE (no home indicator), an older notch phone's 21, a home-indicator iPhone's 34. */
export const BOTTOM_INSETS = [0, 21, 34] as const;

type Node = { type: string; props: Record<string, unknown>; children: (Node | string)[] | null };

/**
 * Every `paddingBottom` and `bottom` the tree's styles set, by the place that sets it.
 * A scroller's content style counts: it is where a list's last row ends.
 */
export function bottomsIn(tree: unknown): { at: string; key: string; value: number }[] {
  const out: { at: string; key: string; value: number }[] = [];
  const walk = (n: Node | string | null, at: string) => {
    if (!n || typeof n === 'string') return;
    for (const prop of ['style', 'contentContainerStyle']) {
      const style = StyleSheet.flatten(n.props[prop] as never) as Record<string, unknown> | undefined;
      for (const key of ['paddingBottom', 'bottom']) {
        const value = style?.[key];
        if (typeof value === 'number') out.push({ at, key: `${prop}.${key}`, value });
      }
    }
    (n.children ?? []).forEach((c, i) => walk(c, `${at}/${i}`));
  };
  (Array.isArray(tree) ? tree : [tree]).forEach((n, i) => walk(n as Node, `${i}`));
  return out;
}

/** The places whose foot is `value`, as `place key`. */
export function bottomPlacesAt(tree: unknown, value: number): Set<string> {
  return new Set(bottomsIn(tree).filter((t) => t.value === value).map((t) => `${t.at} ${t.key}`));
}

/** What a page puts its foot at, for a failure to show: each distinct value once. */
export function bottomValues(tree: unknown): number[] {
  return [...new Set(bottomsIn(tree).map((t) => t.value))].sort((a, b) => a - b);
}

/**
 * Draws `draw(inset)` at every inset and returns, for `want(inset)`, what is
 * missing and the places that held it at all three.
 */
export async function placesHoldingFoot(
  draw: (insetBottom: number) => Promise<{ tree: unknown; done: () => void }>,
  want: (insetBottom: number) => number,
) {
  const missing: string[] = [];
  let same = null as Set<string> | null;
  for (const inset of BOTTOM_INSETS) {
    const { tree, done } = await draw(inset);
    const at = bottomPlacesAt(tree, want(inset));
    if (at.size === 0) missing.push(`${inset}pt: no foot at ${want(inset)}, only ${bottomValues(tree)}`);
    same = same ? new Set([...same].filter((p) => at.has(p))) : at;
    done();
  }
  if (missing.length === 0 && same!.size === 0) missing.push('the foot moved between insets: no one place holds it');
  return missing;
}
