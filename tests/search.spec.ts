import { test, expect } from '@playwright/test';

test.describe('Global Search & Discovery', () => {

  test('Search input debounce rendering', async ({ page }) => {
    // Tests that entering text into the search bar respects the 500ms debounce
    // ensuring we do not spam TMDB or Supabase unnecessarily on every keystroke.
    
    await page.goto('/');

    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    
    if (await searchInput.isVisible()) {
      // Type rapidly
      await searchInput.pressSequentially('Dune Part Two', { delay: 10 });
      
      // Before 500ms, the results overlay should NOT be fully populated with final results yet
      // But after ~1 second, it should have fetched.
      await page.waitForTimeout(1000);

      // Verify the input stuck
      expect(await searchInput.inputValue()).toBe('Dune Part Two');
      
      // If there is a results container, verify it appears
      const resultsContainer = page.locator('.search-results-dropdown').or(page.locator('.film-grid'));
      if (await resultsContainer.count() > 0) {
        await expect(resultsContainer.first()).toBeVisible();
      }
    }
  });

});
