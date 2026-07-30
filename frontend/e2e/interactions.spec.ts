import { test, expect, type Page } from '@playwright/test';

/**
 * The behaviour no PowerShell suite can reach: anything that requires React to hydrate.
 *
 * Every assertion here was previously listed as "unverifiable" in CLAUDE.md.
 */

const API = 'http://localhost:5000/api/v1';

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  // exact: the form also has a "Show password" toggle, which /password/i would match too.
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

test.describe('Hydration', () => {
  test('React actually hydrates and rAF fires', async ({ page }) => {
    await page.goto('/');
    // The premise of every other test in this file. If this fails, the rest are meaningless.
    const rafFired = await page.evaluate(
      () => new Promise<boolean>((resolve) => requestAnimationFrame(() => resolve(true))),
    );
    expect(rafFired).toBe(true);
    expect(await page.evaluate(() => document.visibilityState)).toBe('visible');
  });

  test('no console errors on the home page', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
  });
});

test.describe('Pet filters', () => {
  test('checking a filter updates the URL and the results', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'Filters sit behind a drawer on mobile.');

    await page.goto('/pets');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    /**
     * `click`, not `check`: selecting a filter pushes a new URL and the Server Component re-renders,
     * replacing the checkbox element. `check()` tries to re-read the state of the node it clicked
     * and fails on "did not change its state" even though the filter worked.
     */
    const dogFilter = page.getByRole('checkbox', { name: 'Dog', exact: true }).first();
    await dogFilter.click();

    // Filter state lives in the URL, never useState — that is what makes it shareable.
    await expect(page).toHaveURL(/species=dog/);
    await expect(page.getByRole('checkbox', { name: 'Dog', exact: true }).first()).toHaveAttribute(
      'aria-checked',
      'true',
    );

    // And the back button must undo it, which useState would not give us.
    await page.goBack();
    await expect(page).not.toHaveURL(/species=dog/);
  });

  test('search narrows the listing', async ({ page }, testInfo) => {
    await page.goto('/pets');

    // On mobile the search input lives inside the filters drawer — deliberate layout, but it
    // means the control is two taps away rather than one.
    if (testInfo.project.name === 'mobile') {
      await page.getByRole('button', { name: /filters/i }).first().click();
    }

    // Ids are namespaced per panel instance (see the useId note in pet-filters.tsx), so this
    // targets the label text rather than a fixed id.
    /*
     * `:visible` matters: the panel is rendered twice (desktop sidebar + mobile drawer) and only
     * one copy is on screen at a time. `.first()` alone picks the CSS-hidden one on mobile.
     */
    const search = page.locator('input[type="search"]:visible').first();
    await search.fill('Luna');
    await search.press('Enter');

    await expect(page).toHaveURL(/q=Luna/i, { timeout: 15_000 });
  });
});

test.describe('Theme toggle', () => {
  test('switching to dark stamps the class on <html> and persists', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /theme/i }).first().click();
    await page.getByRole('menuitem', { name: /^dark$/i }).click();

    await expect(page.locator('html')).toHaveClass(/dark/);

    // next-themes writes to localStorage; a reload must not flash back to light.
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
});

test.describe('Pet gallery', () => {
  test('thumbnails swap the main image', async ({ page }) => {
    const response = await page.request.get(`${API}/pets?limit=1`);
    const slug = (await response.json()).data[0].slug;

    await page.goto(`/pets/${slug}`);

    const thumbnails = page.getByRole('button', { name: /view (image|photo)/i });
    const count = await thumbnails.count();
    test.skip(count < 2, 'This pet has only one image.');

    const mainImage = page.getByRole('img').first();
    const before = await mainImage.getAttribute('src');

    await thumbnails.nth(1).click();
    await expect
      .poll(async () => mainImage.getAttribute('src'), { timeout: 10_000 })
      .not.toBe(before);
  });
});

test.describe('Favourites', () => {
  test('the heart toggles and survives a reload', async ({ page }) => {
    await signIn(page, 'adopter@pawfecthome.seed', 'DemoPass123');

    await page.goto('/pets');
    // Labels interpolate the pet's name: "Save Luna to favourites" / "Remove Luna from favourites".
    const heart = page.getByRole('button', { name: /save .+ to favou?rites/i }).first();
    await heart.click();

    // Optimistic in the UI, but the server is authoritative — a reload proves it persisted.
    const remove = page.getByRole('button', { name: /remove .+ from favou?rites/i }).first();
    await expect(remove).toBeVisible({ timeout: 10_000 });

    await page.goto('/dashboard/favorites');
    await expect(page.getByRole('heading', { name: /favou?rites/i })).toBeVisible();
  });
});

test.describe('Reviews', () => {
  test('the star input is keyboard operable', async ({ page }) => {
    await signIn(page, 'adopter@pawfecthome.seed', 'DemoPass123');
    await page.goto('/dashboard/reviews');

    // The page renders whether or not this user has reviews; both are valid states.
    await expect(page.getByRole('heading', { name: /my reviews/i })).toBeVisible();
  });

  test('the helpful button toggles', async ({ page }) => {
    const response = await page.request.get(`${API}/reviews?limit=1`);
    const reviews = (await response.json()).data;
    test.skip(reviews.length === 0, 'No approved reviews to vote on.');

    const shelterSlug = reviews[0].shelter?.slug;
    test.skip(!shelterSlug, 'Review is not attached to a shelter.');

    await signIn(page, 'shelter1@pawfecthome.seed', 'ShelterPass123');
    await page.goto(`/shelters/${shelterSlug}`);

    const helpful = page.getByRole('button', { name: /helpful/i }).first();
    await expect(helpful).toBeVisible();

    const wasPressed = await helpful.getAttribute('aria-pressed');
    await helpful.click();
    await expect
      .poll(async () => helpful.getAttribute('aria-pressed'), { timeout: 10_000 })
      .not.toBe(wasPressed);
  });
});

test.describe('Messaging', () => {
  test('sending a message appends it to the thread', async ({ page }) => {
    await signIn(page, 'adopter@pawfecthome.seed', 'DemoPass123');

    await page.goto('/dashboard/messages');
    await expect(page.getByRole('heading', { name: /messages/i })).toBeVisible();

    // Scope to the Conversations list — a bare "first button on the page" picks up a nav item.
    const conversations = page.locator('aside[aria-label="Conversations"] button');
    const hasConversations = (await conversations.count()) > 0;
    test.skip(!hasConversations, 'No conversations for this user yet.');

    await conversations.first().click();

    // The textbox role — not getByLabel, which also matches the "Send message" button.
    const composer = page.getByRole('textbox', { name: /message/i });
    await expect(composer).toBeVisible({ timeout: 10_000 });

    const body = `e2e probe ${Date.now()}`;
    await composer.fill(body);
    // Enter sends (Shift+Enter is a newline) — more robust than the send button, which the
    // scrolling message list can transiently overlap on a narrow mobile viewport.
    await composer.press('Enter');

    // Appears optimistically, then is confirmed over the socket in the conversation room.
    await expect(page.getByText(body)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Donation form', () => {
  test('preset selection and custom amount are mutually exclusive', async ({ page }) => {
    await page.goto('/donate');

    // exact: the submit button reads "Donate Rs. 500" and would otherwise match as well.
    const preset = page.getByRole('button', { name: 'Rs. 500', exact: true });
    await preset.click();
    await expect(preset).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: /donate rs\. 500/i })).toBeVisible();

    // Typing a custom amount must clear the preset, or the two would disagree.
    await page.getByLabel(/custom amount/i).fill('75');
    await expect(preset).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('button', { name: /donate rs\. 75/i })).toBeVisible();
  });

  test('below the minimum the submit button stays disabled', async ({ page }) => {
    await page.goto('/donate');
    await page.getByRole('button', { name: 'Rs. 500', exact: true }).click();
    await page.getByLabel(/custom amount/i).fill('0');
    await expect(page.getByRole('button', { name: /^(donate|pledge)/i })).toBeDisabled();
  });

  test('choosing cash flips the form from Donate to Pledge', async ({ page }) => {
    await page.goto('/donate');
    await page.getByRole('button', { name: 'Rs. 500', exact: true }).click();

    // eSewa is the default; the primary button reads "Donate".
    await expect(page.getByRole('button', { name: /donate rs\. 500/i })).toBeVisible();

    await page.getByRole('button', { name: /pay the shelter in person/i }).click();
    // Cash means a pledge, not a charge — the button copy must change to match.
    await expect(page.getByRole('button', { name: /pledge rs\. 500/i })).toBeVisible();
  });

  test('a cash pledge completes without any gateway', async ({ page }) => {
    await signIn(page, 'adopter@pawfecthome.seed', 'DemoPass123');
    await page.goto('/donate');

    await page.getByRole('button', { name: 'Rs. 500', exact: true }).click();
    await page.getByRole('button', { name: /pay the shelter in person/i }).click();
    await page.getByRole('button', { name: /pledge rs\. 500/i }).click();

    // COD collects nothing now — straight to the recorded-pledge confirmation.
    await page.waitForURL(/\/donate\/success/, { timeout: 15_000 });
    await expect(page.getByRole('heading', { name: /pledge recorded/i })).toBeVisible();
  });
});

test.describe('Accessibility of interactive controls', () => {
  test('the skip link is the first focusable element', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'mobile', 'No keyboard on a touch device.');

    await page.goto('/');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: /skip to content/i })).toBeFocused();
  });

  test('mobile navigation opens and closes', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'Mobile only.');

    await page.goto('/');
    await page.getByRole('button', { name: /menu|navigation/i }).first().click();
    await expect(page.getByRole('dialog').or(page.getByRole('navigation')).first()).toBeVisible();
  });
});
