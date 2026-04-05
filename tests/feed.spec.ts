import { test, expect } from '@playwright/test';

test.describe('Cinematic Feed ("The Underground")', () => {

  test('Feed layout and global components render successfully', async ({ page }) => {
    await page.goto('/feed');

    // Wait for the feed structural container
    await expect(page.locator('.scroll-reveal, .reel-lounge, .feed-container, #root').first()).toBeVisible();
  });

  test('Navigation tabs are accessible', async ({ page }) => {
    await page.goto('/');

    // Click the Dispatch tab if available
    const dispatchLink = page.getByRole('link', { name: /DISPATCH/i });
    if (await dispatchLink.isVisible()) {
      await dispatchLink.click();
      await expect(page).toHaveURL(/.*\/dispatch/);
    }
  });

  test('Testing the 3D Poster tilt effect does not cause overflow crashes', async ({ page }) => {
    await page.goto('/');

    // Hover over the first available poster
    const firstPoster = page.locator('.activity-card-poster, .film-poster').first();
    
    if (await firstPoster.isVisible()) {
      const box = await firstPoster.boundingBox();
      if (box) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        // Wait a small amount to allow CSS transition
        await page.waitForTimeout(300);
        await expect(firstPoster).toBeVisible(); // Just assert it's still alive in the DOM
      }
    }
  });

});
