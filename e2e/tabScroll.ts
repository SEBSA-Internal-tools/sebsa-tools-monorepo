import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Scroll the page down as far as a reader could and still click `tab`.
 *
 * The measurement this exists to protect is easy to fake and was faked once: an
 * earlier note in the codebase recorded "scrolled to y=400, tab landed at y=28"
 * and concluded that preserving scroll across tabs was impossible. It was an
 * artifact. At y=400 the tab strip is above the fold, so Playwright scrolled the
 * page to bring it into view before clicking — the click never happened from
 * y=400, and the y=28 was Playwright's own scrolling, not the app's.
 *
 * So the offset is derived from where the tab actually is rather than picked,
 * and it leaves the tab clear of the sticky header (`AppBar` is `sticky
 * top-0`, roughly 64px). A click that Playwright has to reposition for is a
 * click a real user could not have made either.
 *
 * Returns the offset the page ended up at, which is what the tab click must
 * preserve.
 */
export async function scrollUntilTabIsTheLowestReachablePoint(
  page: Page,
  tab: Locator,
): Promise<number> {
  const documentTop = await tab.evaluate(
    (node) => node.getBoundingClientRect().top + window.scrollY,
  );

  // 140 = the sticky header plus enough margin that the tab is unambiguously
  // hittable, not merely technically on screen.
  const offset = Math.max(0, Math.round(documentTop - 140));
  await page.evaluate((y) => {
    window.scrollTo(0, y);
  }, offset);

  const reached = await page.evaluate(() => window.scrollY);
  expect(reached, 'the page must be scrollable for this test to mean anything').toBeGreaterThan(0);
  expect(
    await tab.evaluate((node) => node.getBoundingClientRect().top),
    'the tab must be clickable without Playwright scrolling the page first',
  ).toBeGreaterThan(80);

  return reached;
}
