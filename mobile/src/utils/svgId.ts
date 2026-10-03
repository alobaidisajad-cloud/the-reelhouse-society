import { useId } from 'react';

/**
 * An id for one drawing's paint server (a gradient, a pattern). Several drawings
 * can share a screen, and a shared id would let the first one's paint fill them
 * all; this one belongs to the component that asks for it.
 */
export function useSvgId(name: string): string {
  return `${name}${useId().replace(/[^A-Za-z0-9]/g, '')}`;
}
