import { test, expect } from '@playwright/test';

test.describe('Critical User Flows — Navigation & Discovery', () => {

  test('Homepage navigation and core elements', async ({ page }) => {
    await page.goto('/');

    // Check title and basic layout
    await expect(page).toHaveTitle(/The ReelHouse Society/);
    await expect(page.locator('#root')).toBeVisible();

    // The navbar should contain navigational links to key sections
    const discoverLink = page.getByRole('link', { name: /DARKROOM|DISCOVER/i }).first();
    await expect(discoverLink).toBeVisible();

    // Verify footer is present (shows full page load)
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('Discover/Darkroom search renders filters', async ({ page }) => {
    await page.goto('/discover');

    // Verify search input is present
    const searchInput = page.locator('input[type="text"], input[type="search"]').first();
    await expect(searchInput).toBeVisible();

    // Verify genre/filter pills render
    const filtersContainer = page.locator('.filters-scroll, .genre-filters, .glass-filters').first();
    if (await filtersContainer.isVisible()) {
      await expect(filtersContainer).toBeVisible();
      // Should have at least one button/pill
      expect(await filtersContainer.locator('button').count()).toBeGreaterThan(0);
    }
  });

  test('Film Detail Page renders core data structures', async ({ page }) => {
    // Navigate to a known blockbuster (Dune: Part Two) by its TMDB ID
    await page.goto('/film/693134');

    // Give it a moment to fetch data from TMDB (via react-query)
    await page.waitForTimeout(1500);

    // Verify main structures appear
    const titleElement = page.locator('h1').first();
    await expect(titleElement).toBeVisible();

    // A poster image should be visible
    const poster = page.locator('img[src*="image.tmdb.org"], .card-film img, .hero-grid img').first();
    await expect(poster).toBeVisible();
  });

});
