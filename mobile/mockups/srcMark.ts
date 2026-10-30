/**
 * srcMark — a component that says where it was written, in drawing runs only.
 *
 * React 19 keeps, for every element, the stack at the moment its JSX ran. The
 * first frame of that stack outside the component's own file is the line in
 * the file that USED it — `<PressableScale` in LogForm.tsx, say. The wrapper
 * puts that site on a `SrcMark` host that the drawing treats as transparent
 * (zz-render.lib), which writes it onto the element as `data-src`: so a touch
 * or text finding in mockups/tools/layout.cjs names its source line, and an
 * exception can name the file it excuses.
 *
 * Wired in jest.setup.ts for MOCKUPS / MOCKUPS_CAPTURE runs; never in the app,
 * never in an ordinary test run.
 */
import { createElement, forwardRef, type ComponentType } from 'react';
import { relative, resolve, sep } from 'path';

const ROOT = resolve(__dirname, '..');

/** The first frame of the owner stack that is not in `own` — as `file:line`. */
export function siteOutside(own: RegExp): string | undefined {
  const capture = (require('react') as { captureOwnerStack?: () => string | null }).captureOwnerStack;
  const stack = String(capture?.() ?? '');
  for (const line of stack.split('\n')) {
    // "at Name (path:line:col)" or "at path:line:col". The path is taken greedily:
    // a route group puts parentheses IN it, as app/(modals)/ does.
    const m = /\((.+):(\d+):\d+\)\s*$/.exec(line) ?? /\bat (.+):(\d+):\d+\s*$/.exec(line);
    if (!m || m[1].includes('node_modules') || own.test(m[1])) continue;
    return `${relative(ROOT, m[1]).split(sep).join('/')}:${m[2]}`;
  }
  return undefined;
}

/**
 * `Component`, marked with the site that used it, and with whatever `more` reads from its props
 * (a weighted control's weight and the axes it may grow on). Refs pass straight through.
 */
export function markSource<P extends object>(Component: ComponentType<P>, own: RegExp, displayName: string,
  more?: (props: Record<string, unknown>) => Record<string, unknown> | null) {
  const Inner = Component as ComponentType<Record<string, unknown>>;
  const Marked = forwardRef<unknown, P>(function Marked(props, ref) {
    const all = props as Record<string, unknown>;
    return createElement('SrcMark', { src: siteOutside(own), ...more?.(all) }, createElement(Inner, { ...all, ref }));
  });
  Marked.displayName = displayName;
  return Marked;
}
