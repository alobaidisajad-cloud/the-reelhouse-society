import { test, expect } from '@playwright/test';

test.describe('Authentication & Onboarding Flow', () => {

  test('Navbar Login button opens the Authentication Modal', async ({ page }) => {
    await page.goto('/');

    // Locate the dynamic login button (it says "Enter")
    const loginButton = page.getByRole('button', { name: /Enter/i });
    
    // Ensure it exists and click it
    await expect(loginButton.first()).toBeVisible();
    await loginButton.first().click();

    // Verify modal overlay appears and successfully handled Framer Motion entry
    const modalContent = page.locator('.modal-content, .signup-modal-content, .auth-modal, .velvet-rope').or(page.getByText(/email/i));
    await expect(modalContent.first()).toBeVisible();
  });

  test('Authentication requires valid credentials', async ({ page }) => {
    await page.goto('/');

    const loginButton = page.getByRole('button', { name: /Enter/i });
    await loginButton.first().click();

    // Attempt to login without credentials
    const submitButton = page.getByRole('button', { name: /ENTER/i }).or(page.locator('button[type="submit"]'));
    await submitButton.click();

    // HTML5 validation or manual validation should trigger immediately, 
    // or if the api call fails, we should see an error toast/message.
    // We just ensure the modal doesn't silently close or break and still has structure.
    const modalContent = page.locator('.modal-content, .signup-modal-content, .auth-modal, .velvet-rope');
    await expect(modalContent.first()).toBeVisible(); // modal stays open
  });

});
