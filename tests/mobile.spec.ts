import { test, expect } from '@playwright/test';

test.describe('Mobile Viewport & Touch Interactions', () => {

  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test('Bottom Navigation renders and custom cursor is suppressed', async ({ page }) => {
    await page.goto('/');

    // 1. Verify Desktop Navbar collapses or hides specific elements
    // The desktop generic link 'DISPATCH' should be hidden or collapsed
    const desktopDispatchLink = page.locator('.nav-center').getByRole('link', { name: /DISPATCH/i });
    if (await desktopDispatchLink.count() > 0) {
       await expect(desktopDispatchLink).not.toBeVisible();
    }

    // 2. Verify BottomNav appears (Mobile only component)
    const bottomNav = page.locator('.bottom-nav, nav[aria-label="Main navigation"]').first();
    await expect(bottomNav).toBeVisible();

    // 3. Verify Custom Cursor is NOT rendered for touch devices
    // Custom cursor mounts dynamically, wait a moment
    await page.waitForTimeout(500);
    const cursorDot = page.locator('.cursor-dot');
    const cursorOuter = page.locator('.cursor-outer');
    
    // Either it shouldn't exist, or it should be display: none
    if (await cursorDot.count() > 0) {
      await expect(cursorDot).not.toBeVisible();
    }
    if (await cursorOuter.count() > 0) {
      await expect(cursorOuter).not.toBeVisible();
    }
  });

});
