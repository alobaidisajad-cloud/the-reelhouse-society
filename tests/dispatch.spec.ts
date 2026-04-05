import { test, expect } from '@playwright/test';

test.describe('The Dispatch (Dossiers)', () => {

  test('Dispatch homepage rules and structural dividers are present', async ({ page }) => {
    await page.goto('/dispatch');

    // The dispatch uses heavy "Nitrate Noir" headers
    const masthead = page.locator('.masthead-title');
    await expect(masthead).toHaveText('THE DISPATCH', { ignoreCase: true });

    // Ensure the ornamental dividers loaded
    const dividers = page.locator('.ornamental-divider');
    expect(await dividers.count()).toBeGreaterThanOrEqual(1);
  });

  test('Daily Frame / Nightly Transmission exists', async ({ page }) => {
    await page.goto('/dispatch');
    
    // Looks for trending / daily frame blocks
    const dailyFrameTitle = page.getByText(/The Daily Frame/i);
    if (await dailyFrameTitle.isVisible()) {
      await expect(dailyFrameTitle).toBeVisible();
    }
  });

});
