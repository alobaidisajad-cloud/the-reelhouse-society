/**
 * Boot Structure Test — Regression Guard
 * ─────────────────────────────────────────────────────────────
 * Ensures AppBootstrapper is imported and rendered in the root layout.
 * This test would have caught the AppBootstrapper unmounting regression
 * that left 7 critical subsystems completely non-functional.
 */
import fs from 'fs';
import path from 'path';

describe('Boot Structure', () => {
  const layoutPath = path.resolve(__dirname, '../_layout.tsx');
  const layoutContent = fs.readFileSync(layoutPath, 'utf8');

  it('imports AppBootstrapper in root layout', () => {
    expect(layoutContent).toContain("import AppBootstrapper from '@/src/providers/AppBootstrapper'");
  });

  it('renders AppBootstrapper in the component tree', () => {
    expect(layoutContent).toContain('<AppBootstrapper>');
    expect(layoutContent).toContain('</AppBootstrapper>');
  });

  it('AppBootstrapper wraps the Stack inside PersistQueryClientProvider', () => {
    const bootstrapperIndex = layoutContent.indexOf('<AppBootstrapper>');
    const stackIndex = layoutContent.indexOf('<Stack');
    const persistIndex = layoutContent.indexOf('<PersistQueryClientProvider');

    // Order: PersistQueryClientProvider > AppBootstrapper > Stack
    expect(persistIndex).toBeLessThan(bootstrapperIndex);
    expect(bootstrapperIndex).toBeLessThan(stackIndex);
  });
});
