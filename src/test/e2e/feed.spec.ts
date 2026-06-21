import { test, expect } from '@playwright/test';

test.describe('Nitrate Noir Web Feed', () => {
  test('Social Pulse Feed loads and does not visually regress', async ({ page }) => {
    // 1. Navigate to the local app
    await page.goto('http://localhost:5173');

    // 2. Wait for the feed layout to mount
    await page.waitForSelector('.feed-container');

    // 3. Verify the main structural elements
    await expect(page.locator('text=The Pulse')).toBeVisible();

    // 4. Visual Regression Test: Take a pixel-perfect snapshot of the feed.
    // If the CSS changes (e.g., the sepia borders break), this test will fail the CI.
    await expect(page).toHaveScreenshot('social-pulse-feed-darkmode.png', {
      maxDiffPixels: 100,
    });
  });

  test('User can mute a log via Trust & Safety engine', async ({ page }) => {
    await page.goto('http://localhost:5173');
    
    // We mock the window.confirm to always return true for the Report dialog
    page.on('dialog', dialog => dialog.accept());

    // Wait for a log card to render
    const firstLogMenu = page.locator('.activity-card-menu-trigger').first();
    await firstLogMenu.click();

    const reportButton = page.locator('text=Report & Mute');
    await reportButton.click();

    // Verify the optimistic UI instantly hides the log
    await expect(page.locator('text=Reported. This user has been muted')).toBeVisible();
  });
});
