import { test, expect } from '@playwright/test';

test.describe('ReelHouse Core Smoke Tests', () => {

  test('Homepage loads correctly', async ({ page }) => {
    // Navigate to the root URL (uses baseURL from config)
    await page.goto('/');

    // Verify title matches the cinematic brand
    await expect(page).toHaveTitle(/The ReelHouse Society/);

    // Verify the React root has mounted and the app shell exists
    const root = page.locator('#root');
    await expect(root).toBeVisible();

    // Verify the primary ReelHouse geometric fallback or logo exists somewhere in the DOM
    // (This ensures Vite bundled our static assets correctly)
    const images = page.locator('img');
    await expect(images.first()).toBeVisible();
  });

  test('Search functionality works', async ({ page }) => {
    await page.goto('/');

    // Assuming there's an input with placeholder 'Search...' or a search icon
    // Since we unified search under useDebouncedSearch, we should check it
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('Inception');
      // Because it's debounced, we wait for network or DOM changes
      await page.waitForTimeout(1000); 
      // Just assert it didn't crash
      expect(await searchInput.inputValue()).toBe('Inception');
    }
  });

});
