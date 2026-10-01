import { expect, test, type Page } from '@playwright/test';

/**
 * The defect: data vanishing after the tab has been left alone.
 *
 * `mockServiceWorker.js` keeps its active clients in a `Set` in module scope and
 * bypasses every request to the real network when that set is empty. A client id
 * is only added when the page posts `MOCK_ACTIVATE`, inside `worker.start()`.
 * Chrome stops an idle service worker after about thirty seconds, so returning
 * to a backgrounded tab found a restarted worker with no clients, passing
 * `/api/*` straight through to Vite — which answers an HTML 404. Every mounted
 * query failed at once, because `refetchOnWindowFocus` fires them all on focus:
 * grids collapsed into error cards, and if `/auth/me` was among them the whole
 * app was replaced by "Lost contact with the demo data".
 *
 * ONLY A REAL BROWSER CAN PROVE ANY OF THIS. jsdom has no service worker, and
 * the `setupServer` used by the unit suite intercepts in-process — the entire
 * failure mode is invisible there. Hence a spec of its own.
 *
 * `ServiceWorker.stopAllWorkers` over CDP is what the browser does on its own
 * after an idle timeout; waiting thirty-plus seconds for the real thing would
 * make this the slowest test in the suite and flaky on a loaded machine.
 *
 * The first test below asserts the mechanism directly rather than through a
 * screen, and that is deliberate: a test that only checks "the grid is still
 * there" passes vacuously whenever the queries it depends on happen to be inside
 * their 30s `staleTime` and never refetch at all. This one cannot.
 */

const EMAIL = 'hiruni.wijethilaka@sebsaworld.com';
const PASSWORD = 'Sebsa@2026';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(EMAIL);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

/** Kills the mock API exactly the way an idle timeout does. */
async function stopServiceWorker(page: Page) {
  const client = await page.context().newCDPSession(page);
  await client.send('ServiceWorker.enable');
  await client.send('ServiceWorker.stopAllWorkers');
  await client.detach();
}

/**
 * Whether `/api` is still being intercepted.
 *
 * The mock API always answers JSON, including for its errors; a bypassed request
 * reaches Vite, which has no `/api` route and replies with an HTML 404. The
 * content type is what tells them apart — the same test `apiClient` uses.
 */
async function isMockApiIntercepting(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    const response = await fetch('/api/auth/me', {
      headers: { Accept: 'application/json' },
    });
    return (response.headers.get('content-type') ?? '').includes('json');
  });
}

test.describe('mock API recovery', () => {
  test('re-attaches the demo API when the tab regains focus', async ({ page }) => {
    await signIn(page);
    await page.goto('/crp/admin');
    // Generous: the admin grid is the heaviest first paint in the app, and this
    // is only the setup — a 5s default here fails the test for machine load
    // rather than for anything it is meant to be proving.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });

    expect(await isMockApiIntercepting(page), 'intercepting before the worker is stopped').toBe(
      true,
    );

    await stopServiceWorker(page);
    expect(await isMockApiIntercepting(page), 'detached once the worker is stopped').toBe(false);

    // The negative control above is what gives this test teeth: without it, a
    // recovery that did nothing would still pass.
    await page.evaluate(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await expect
      .poll(() => isMockApiIntercepting(page), {
        message: 'the demo API should re-attach on focus',
      })
      .toBe(true);
  });

  test('serves a screen opened after the worker was stopped, without an error state', async ({
    page,
  }) => {
    await signIn(page);
    await page.goto('/crp/admin');
    // Generous: the admin grid is the heaviest first paint in the app, and this
    // is only the setup — a 5s default here fails the test for machine load
    // rather than for anything it is meant to be proving.
    await expect(page.getByRole('table')).toBeVisible({ timeout: 20_000 });

    await stopServiceWorker(page);

    /*
     * Handovers is deliberate: `/api/handovers` is not fetched by any other
     * admin screen, so opening the tab issues a genuinely new request. Picking
     * a tab whose data was already cached would prove nothing.
     *
     * Nothing re-activates the worker before this request — the recovery that
     * has to fire is the one-shot retry inside `apiClient`.
     */
    await page.getByRole('link', { name: /handovers/i }).click();
    await expect(page).toHaveURL(/\/admin\/handovers$/);

    // The seed raises handovers, so a SUCCESSFUL request lists them. That is the
    // assertion: rows prove the fetch resolved, where an error state would prove
    // it did not.
    await expect(page.getByText(/showing [1-9]\d* of [1-9]\d* handovers/i)).toBeVisible();

    // Neither failure screen may appear: not the whole-app one...
    await expect(page.getByText(/lost contact with the demo data/i)).toHaveCount(0);
    // ...nor the panel-level one.
    await expect(page.getByText(/this page ran into a problem/i)).toHaveCount(0);
  });
});
