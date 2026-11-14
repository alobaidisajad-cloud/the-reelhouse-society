/**
 * stackingOrder.js — two views iOS and Android would stack the other way round, read from a render.
 *
 * Fabric mounts, inside each stacking context, every descendant that forms a view as one flat list:
 * a view that forms none is flattened away, and one that forms a view but no stacking context has
 * its children hoisted beside it. iOS draws that list by zIndex (a tie to the later); Android by
 * elevation first, then the same. So two views of one list whose orders disagree are drawn the other
 * way round on one platform. Only a pair whose upper view (on iOS) is placed absolutely is named: an
 * in-flow view rarely overlaps its siblings, and an absolute one is placed over others on purpose.
 *
 * The traits follow React Native's view flattening (ViewShadowNode): a stacking context is formed by
 * collapsable={false}, pointerEvents none, a nativeID, accessible, opacity below 1, a transform, a
 * zIndex on a view not static, display none, overflow hidden or scroll, a touch handler, a shadow
 * colour, a modal or hidden-from-accessibility view, and on Android an elevation; every host that is
 * not a plain View (a scroll view, an image, a native component) keeps its children inside it.
 * Run on every render the tests make (react-native-testing-library.js), failed after each test
 * (jest.afterEnv.ts).
 */
const { StyleSheet } = require('react-native');

const meaningful = (c) => c !== undefined && c !== null && c !== 'transparent' && !/^rgba\([^)]*,\s*0\)$/.test(String(c));

function traits(node) {
  const p = node.props || {};
  const s = StyleSheet.flatten(p.style) || {};
  const opacity = s.opacity === undefined ? 1 : Number(s.opacity);
  const transform = Array.isArray(s.transform) ? s.transform.length > 0 : !!s.transform;
  const touch = Object.keys(p).some((k) => /^on(Press|Touch|Responder|StartShouldSet|MoveShouldSet|Pointer)/.test(k));
  const elevation = Number(s.elevation || 0);
  const context = node.type !== 'View' || elevation !== 0 || p.collapsable === false
    || p.pointerEvents === 'none' || s.pointerEvents === 'none' || !!p.nativeID || p.accessible === true
    || opacity !== 1 || transform || (s.zIndex !== undefined && s.position !== 'static') || s.display === 'none'
    || s.overflow === 'hidden' || s.overflow === 'scroll' || touch || meaningful(s.shadowColor)
    || !!p.accessibilityViewIsModal || !!p.accessibilityElementsHidden
    || (p.importantForAccessibility !== undefined && p.importantForAccessibility !== 'auto');
  const border = ['borderWidth', 'borderTopWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderRightWidth']
    .some((k) => Number(s[k] || 0) > 0);
  return {
    s, context, elevation,
    zIndex: Number(s.zIndex || 0),
    absolute: s.position === 'absolute',
    view: context || meaningful(s.backgroundColor) || border || !!p.testID,
  };
}

/** What a view is, in a line a reader can find it by. */
function named(node) {
  const p = node.props || {};
  const t = traits(node);
  const keys = Object.keys(t.s).filter((k) => !/^(margin|padding)/.test(k)).slice(0, 8).join(',');
  return `${node.type}${p.testID ? `#${p.testID}` : ''}${p.accessibilityLabel ? ` "${String(p.accessibilityLabel).slice(0, 40)}"` : ''}`
    + ` (zIndex ${t.zIndex}, elevation ${t.elevation}${t.absolute ? ', absolute' : ''}; ${keys})`;
}

/** The views one stacking context mounts, in tree order. */
function listOf(node, out = []) {
  for (const child of node.children || []) {
    if (!child || typeof child === 'string') continue;
    const t = traits(child);
    if (t.view) out.push(child);
    if (!t.context) listOf(child, out);
  }
  return out;
}

/** Each pair in the tree iOS and Android would stack the other way round, as a line. */
function misordered(json) {
  const found = new Set();
  const visit = (context) => {
    const list = listOf(context);
    const t = list.map(traits);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (t[i].elevation === t[j].elevation) continue;
        const iosLaterOver = t[j].zIndex >= t[i].zIndex;
        const androidLaterOver = t[j].elevation > t[i].elevation;
        if (iosLaterOver === androidLaterOver) continue;
        const [over, under] = iosLaterOver ? [j, i] : [i, j];
        if (!t[over].absolute) continue;
        found.add(`iOS draws ${named(list[over])} over ${named(list[under])}; Android, under it`);
      }
    }
    list.forEach((member, k) => { if (t[k].context) visit(member); });
  };
  for (const root of Array.isArray(json) ? json : [json]) if (root && typeof root === 'object') visit({ children: [root] });
  return [...found];
}

module.exports = { misordered, traits, listOf };
