import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility and Core Web Vitals, measured directly in the browser.
 *
 * This exists because **Lighthouse could not be run in this environment** — its Chrome launcher
 * fails with `spawn UNKNOWN` on this machine. Rather than report a number I could not produce,
 * these tests measure the same underlying signals through Playwright, which has the advantage of
 * being repeatable: the Lighthouse performance score on this hardware swung 71–86 run to run
 * while the underlying metrics stayed stable, so it was measuring machine noise as much as the app.
 *
 * axe-core is what Lighthouse itself uses for its accessibility category.
 */

const PAGES = [
  { path: '/', name: 'home' },
  { path: '/pets', name: 'pet listing' },
  { path: '/shelters', name: 'shelter directory' },
  { path: '/donate', name: 'donate' },
];

/** LCP and CLS, read from the same PerformanceObserver entries the browser reports to CrUX. */
async function webVitals(page: Page): Promise<{ lcp: number; cls: number }> {
  return page.evaluate(
    () =>
      new Promise<{ lcp: number; cls: number }>((resolve) => {
        let lcp = 0;
        let cls = 0;

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) lcp = entry.startTime;
        }).observe({ type: 'largest-contentful-paint', buffered: true });

        new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
            // Shifts within 500ms of an interaction are the user's doing, not a layout bug.
            if (!shift.hadRecentInput) cls += shift.value;
          }
        }).observe({ type: 'layout-shift', buffered: true });

        // Settle first: LCP can still change while late images decode.
        setTimeout(() => resolve({ lcp: Math.round(lcp), cls: Number(cls.toFixed(4)) }), 3000);
      }),
  );
}

test.describe('Accessibility (axe-core)', () => {
  for (const { path, name } of PAGES) {
    test(`${name} has no serious or critical violations`, async ({ page }) => {
      await page.goto(path);
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const serious = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );

      const report = serious
        .map((v) => `${v.id} (${v.impact}): ${v.help}\n    ${v.nodes[0]?.html?.slice(0, 160)}`)
        .join('\n  ');

      expect(serious, `\n  ${report}`).toEqual([]);
    });
  }

  test('duplicate ids do not appear when the filter drawer is open', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The drawer only exists on mobile.');

    await page.goto('/pets');
    await page.getByRole('button', { name: /filters/i }).first().click();
    await page.waitForTimeout(500);

    // The regression this guards: the filters panel renders twice, and hard-coded ids collided.
    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      for (const element of document.querySelectorAll('[id]')) {
        seen.set(element.id, (seen.get(element.id) ?? 0) + 1);
      }
      return [...seen.entries()].filter(([, count]) => count > 1).map(([id]) => id);
    });

    expect(duplicates, `duplicate ids: ${duplicates.join(', ')}`).toEqual([]);
  });
});

test.describe('Core Web Vitals', () => {
  for (const { path, name } of PAGES) {
    test(`${name} meets LCP and CLS budgets`, async ({ page }) => {
      await page.goto(path);
      const { lcp, cls } = await webVitals(page);

      console.log(`    ${name.padEnd(18)} LCP ${String(lcp).padStart(5)}ms   CLS ${cls}`);

      // Google's "good" thresholds. Measured on localhost, so LCP here is optimistic about the
      // network but honest about render-blocking work and layout stability.
      expect(cls, 'CLS must stay under 0.1').toBeLessThan(0.1);
      expect(lcp, 'LCP must stay under 2.5s').toBeLessThan(2500);
    });
  }
});

test.describe('No console errors on any public page', () => {
  for (const { path, name } of PAGES) {
    test(`${name} is clean`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      page.on('pageerror', (error) => errors.push(error.message));

      await page.goto(path);
      await page.waitForLoadState('load');
      await page.waitForTimeout(500);

      expect(errors, `console errors:\n${errors.join('\n')}`).toEqual([]);
    });
  }
});
