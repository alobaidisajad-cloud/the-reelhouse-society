/**
 * reportSheetDimensions.guard.test.ts — batch 25 · #121
 * ─────────────────────────────────────────────────────
 * The sheet read the window height ONCE, at bundle load, and sized itself to
 * whatever the window was then — wrong after a rotation, in split-screen, and in
 * iPad multitasking. It was the ONLY module-load `Dimensions.get` in the app;
 * every other component already took the reactive hook, and that inconsistency
 * is what marked it an oversight rather than a decision.
 */
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.join(__dirname, '..', '..', '..', '..');
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

const sheet = strip(
  fs.readFileSync(path.join(ROOT, 'src/components/moderation/ReportSheet.tsx'), 'utf8'),
);

describe('#121 · the sheet measures the window when it opens', () => {
  it('takes the reactive hook, not a frozen read', () => {
    expect(sheet).toMatch(/useWindowDimensions\(\)/);
    expect(sheet).not.toMatch(/Dimensions\.get\(/);
  });

  it('the height is applied INLINE — a stylesheet is evaluated once', () => {
    // Leaving it in StyleSheet.create would have kept the bug while looking
    // fixed: the hook would update and the style would not.
    expect(sheet).toMatch(/\{ height: windowHeight \* SHEET_HEIGHT_RATIO \}/);
    const styles = sheet.slice(sheet.indexOf('StyleSheet.create('));
    expect(styles).not.toMatch(/height: SHEET_HEIGHT\b/);
  });

  it('no worklet captures the height — the reason this swap is safe', () => {
    // A hook value and a module constant behave differently inside a worklet, so
    // a reanimated style deriving from the height would break on this change.
    // These derive only from scale, opacity and translateY.
    for (const m of sheet.matchAll(/useAnimatedStyle\(\(\) =>([\s\S]{0,160}?)\}\)\)/g)) {
      expect(`worklet:${/windowHeight|SHEET_HEIGHT/.test(m[1])}`).toBe('worklet:false');
    }
  });
});

describe('#121 · the sheet fully leaves the screen on any window', () => {
  it('travels the window height, not a hardcoded 800', () => {
    // The sheet is three quarters of the window, so on anything taller than
    // ~1067pt — an iPad in portrait is 1366 — it was TALLER than the distance it
    // moved: roughly 224pt never left the screen. It popped into view on open
    // and left a sliver behind on close. Pre-existing, but it sat in the code
    // this finding touches and is the same defect class: a guessed dimension.
    expect(sheet).not.toMatch(/translateY\.value = 800/);
    expect(sheet).not.toMatch(/withTiming\(800,/);
    expect(sheet).not.toMatch(/useSharedValue\(800\)/);
    expect(sheet).toMatch(/translateY\.value = offscreenRef\.current/);
    expect(sheet).toMatch(/withTiming\(offscreenRef\.current,/);
  });

  it('reads it from a ref, so a rotation cannot replay the entry animation', () => {
    // The distance must be current, but adding it to the animation effect's
    // dependencies would re-run that effect on every resize — replaying the
    // open transition while the member is filling the form in.
    expect(sheet).toMatch(/offscreenRef\.current = windowHeight;/);
    const effect = sheet.slice(sheet.indexOf('React.useEffect(() => {'));
    const deps = effect.slice(0, effect.indexOf('}, ['));
    expect(deps.length).toBeGreaterThan(50);
    expect(effect).toMatch(/\}, \[visible, opacity, translateY, isRendered\]\)/);
  });
});

describe('#121 · the class, swept — no file freezes the window at load', () => {
  it('no module-scope Dimensions.get survives anywhere', () => {
    // Enumerated, not spot-checked: this was a one-of-one, and the point of the
    // fix is that it stays that way.
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (['node_modules', '__tests__', '.expo', 'android', 'ios'].includes(e.name)) continue;
          walk(full, out);
        } else if (/\.tsx?$/.test(e.name)) out.push(full);
      }
      return out;
    };

    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, 'src')), ...walk(path.join(ROOT, 'app'))]) {
      const src = strip(fs.readFileSync(file, 'utf8'));
      // Module scope = no leading indentation.
      if (/^(export )?const .*=\s*Dimensions\.get\(/m.test(src)) {
        offenders.push(path.relative(ROOT, file).replace(/\\/g, '/'));
      }
    }
    expect(offenders).toEqual([]);
  });
});
