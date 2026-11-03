/**
 * A handle too long for its line, broken in two as the house sets it: after its own separator
 * nearest the middle (an underscore or a dot), or at the middle when it has none. Never left to
 * the phone, which would break it wherever the line ran out, mid-letter-group, or shrink it past
 * what can be read. Split near the middle, the two pieces take one size.
 */
export function breakHandle(handle: string): [string, string] {
  const middle = handle.length / 2;
  let at = -1;
  for (let i = 1; i < handle.length - 1; i++) {
    if ((handle.charAt(i) === '_' || handle.charAt(i) === '.') && (at === -1 || Math.abs(i + 1 - middle) < Math.abs(at - middle))) at = i + 1;
  }
  const cut = at === -1 ? Math.ceil(middle) : at;
  return [handle.slice(0, cut), handle.slice(cut)];
}
