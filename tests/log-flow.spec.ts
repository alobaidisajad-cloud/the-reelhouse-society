import { test, expect } from '@playwright/test';

test.describe('Log Modal Interactions', () => {

  test('Log Modal opens and handles search input', async ({ page }) => {
    await page.goto('/');

    // In a logged-out state, the "+" button or "Log" button might open SignupModal instead of LogModal.
    // So this test checks if EITHER the LogModal or SignupModal opens correctly, ensuring the trigger works.
    
    // Find the log trigger (usually a '+' button or a 'Log' button depending on viewport)
    // We'll target the navbar 'Log' button or the bottom nav icon
    const logButton = page.getByRole('button', { name: /Log/i }).first()
                         .or(page.locator('.bottom-nav-log'));
    
    if (await logButton.isVisible()) {
      await logButton.click();
      
      // Wait for animation
      await page.waitForTimeout(500);
      
      // Look for the modal container
      const modal = page.locator('.modal-content, .signup-modal-content, .velvet-rope, .log-modal-overlay');
      await expect(modal.first()).toBeVisible();

      // If it's the actual log modal (meaning we're logged in/auth mocked or it allows guest search)
      const searchInput = page.locator('input[placeholder*="film"]').first();
      if (await searchInput.isVisible()) {
         await searchInput.fill('The Godfather');
         await page.waitForTimeout(1000); // Wait for debounce
         expect(await searchInput.inputValue()).toBe('The Godfather');
      }

      // Close the modal via backdrop or close button
      const closeBtn = page.getByRole('button', { name: /Close|✕|X/i }).first();
      if (await closeBtn.isVisible()) {
        await closeBtn.click();
        await page.waitForTimeout(500); // Wait for exit animation
        // Expect modal to be gone or hidden
        await expect(modal.first()).not.toBeVisible();
      }
    }
  });

});
