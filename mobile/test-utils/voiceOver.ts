/**
 * voiceOver — whether VoiceOver can reach a control the tests found.
 *
 * iOS reads an accessibility element (a View or Pressable with `accessible`, which a
 * Pressable is unless told otherwise) as ONE stop and never goes inside it. A control
 * drawn inside one is lost to a VoiceOver member however well it is named, unless the
 * element around it offers the control's act by name (an accessibilityAction) or is
 * 'adjustable'. The tests find a control by its label either way, so they cannot see
 * this unless they ask (mockups/tools/layout.cjs NESTED asks it of every captured screen).
 */
import type { render } from '@testing-library/react-native';

type Node = ReturnType<ReturnType<typeof render>['getByText']>;

/** The accessibility element that holds this control, if one does: VoiceOver stops there, not here. */
export function stopAround(control: Node): Node | null {
  for (let at = control.parent; at; at = at.parent) {
    if (at.props.accessible === true) return at;
  }
  return null;
}

/** The acts an accessibility element offers by name (each action's label, or its name). */
export function actsOffered(element: Node): string[] {
  const acts = (element.props.accessibilityActions ?? []) as { name: string; label?: string }[];
  return acts.map((a) => a.label ?? a.name);
}
