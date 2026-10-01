/**
 * aLabelIsSpoken.test.ts — a label on a View is spoken only if the View is `accessible`.
 * ─────────────────────────────────────────────────────────────────────────────
 * React Native does not make a plain View an accessibility element. A View that
 * carries `accessibilityLabel` or a role but not `accessible` is never landed on,
 * so its words are never spoken: "Loading filings", the Auteur Hunt's progress,
 * a room's header. Either it is made `accessible`, or the label goes.
 *
 * A CONTAINER role is the exception, because it belongs on a group whose children
 * are the accessible things: made `accessible`, a radiogroup would swallow its
 * own options into one element.
 */
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import ts from 'typescript';
import { MOBILE } from '@/test-utils/readCode';

/** Roles that name a group of accessible children, never one element. */
const CONTAINER_ROLES = new Set(['radiogroup', 'tablist', 'alert', 'list', 'toolbar', 'menu', 'menubar']);

export function silentLabels(rel: string, text: string): string[] {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && /^(Animated\.)?View$/.test(n.tagName.getText(sf))) {
      const attrs = n.attributes.properties.filter(ts.isJsxAttribute);
      const named = (k: string) => attrs.find((a) => a.name.getText(sf) === k);
      const label = named('accessibilityLabel');
      const role = named('accessibilityRole');
      const roleText = role?.initializer?.getText(sf).replace(/["'{}]/g, '') ?? '';
      const accessible = named('accessible');
      const isAccessible = !!accessible && !/false/.test(accessible.initializer?.getText(sf) ?? '');
      // A container may carry its group's name; its children are what is landed on.
      if ((label || role) && !CONTAINER_ROLES.has(roleText) && !isAccessible) {
        found.push(`${rel}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${roleText || 'label'}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

function screens(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '__tests__' && name !== 'node_modules') screens(p, out); continue; }
    if (name.endsWith('.tsx') && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('a label on a View is spoken', () => {
  it('the scan finds a silent label, and passes over a spoken one and a container', () => {
    const probe = [
      '<View accessibilityLabel="Loading" />',
      '<View accessible accessibilityRole="progressbar" accessibilityLabel="Loading" />',
      '<View accessibilityRole="radiogroup" accessibilityLabel="Billing"><View /></View>',
      '<Animated.View accessibilityRole="header" />',
    ].join('\n');
    expect(silentLabels('probe.tsx', probe)).toEqual(['probe.tsx:1 label', 'probe.tsx:4 header']);
  });

  it('on every screen: each labelled View is accessible, or a container', () => {
    const files = [...screens(join(MOBILE, 'app')), ...screens(join(MOBILE, 'src'))];
    expect(files.length).toBeGreaterThan(200);
    const silent = files.flatMap((f) => silentLabels(relative(MOBILE, f).split(sep).join('/'), readFileSync(f, 'utf8')));
    expect(silent).toEqual([]);
  });
});
