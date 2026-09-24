/**
 * CAPTURE — every screen the unit tests already build, drawn for measuring.
 * ─────────────────────────────────────────────────────────────────────────────
 * The generators draw the screens someone thought to set up. The unit tests
 * mount far more — every sheet, every error, every empty and loading state —
 * with mocks that already work. Run with capture on, and the last thing each
 * test rendered is written out as a screen for `mockups/tools/layout.cjs`:
 *
 *   MOCKUPS_CAPTURE=1 RNTL_SKIP_AUTO_CLEANUP=true npx jest <tests>
 *   node mockups/tools/layout.cjs --src mockups/out/captured
 *
 * (PowerShell: `$env:MOCKUPS_CAPTURE=1; $env:RNTL_SKIP_AUTO_CLEANUP='true'; npx jest <tests>`)
 *
 * The testing library's own cleanup is switched off for the run, and this
 * cleans up instead — AFTER the picture — so the screen is still mounted when
 * it is drawn. The window is a 390pt phone (jest.setup.ts), not jest-expo's
 * 750pt tablet, so a width the screen computes is a phone's width.
 *
 * What a captured screen is NOT: art (no posters are loaded) or light. It is
 * for words — whether every one fits where it is set, at every size.
 */
import { mkdirSync, writeFileSync } from 'fs';
import { basename, join } from 'path';

export const CAPTURED = process.env.MOCKUPS_CAPTURED_OUT ?? join(__dirname, 'out', 'captured');

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);

export function captureAfterEach(): void {
  afterEach(async () => {
    const rntl = require('@testing-library/react-native');
    try {
      // The library's own `screen`, read live. The project's wrapper
      // (test-utils/react-native-testing-library.js) spreads the library's
      // exports once, so ITS `screen` is the empty default for ever.
      const { screen } = require(join(__dirname, '..', 'node_modules', '@testing-library', 'react-native', 'dist', 'screen.js'));
      const tree = screen.toJSON();
      if (tree) {
        const { toHtml } = require('@/src/components/profile/__tests__/zz-render.lib');
        const { testPath, currentTestName } = expect.getState();
        const name = `${slug(basename(testPath ?? 'test').replace(/\.test\.tsx?$/, ''))}--${slug(currentTestName ?? 'render')}`;
        mkdirSync(CAPTURED, { recursive: true });
        writeFileSync(join(CAPTURED, `${name}.html`), toHtml(tree, {}), 'utf8');
      }
    } catch (e) {
      if (process.env.MOCKUPS_CAPTURE_DEBUG) console.log('CAPTURE', String(e));
      // nothing rendered in this test, or it unmounted itself — nothing to draw
    }
    await rntl.cleanup();
  });
}
