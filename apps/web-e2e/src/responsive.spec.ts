import { expect, test, type Page } from '@playwright/test';

/**
 * Every route, at every width the breakpoint policy names.
 *
 * The per-workspace specs each checked ONE screen at four widths, which left
 * both ends of the range untested: 1920 and 2560 were never exercised at all,
 * and they are exactly what the 1600px container exists for. Layout defects
 * here are invisible to jsdom — it computes no layout — so a real browser
 * measuring real boxes is the only thing that can catch them.
 *
 * Two invariants, from `docs/frontend-standards.md` § 8:
 *
 *   1. The page never scrolls horizontally.
 *   2. No interactive control is cut off at any width.
 *
 * When (1) fails the message names the offending elements. A silent "3px of
 * overflow" tells you nothing; `TaskFilterBar > select` tells you where to look.
 */

const PASSWORD = 'Sebsa@2026';

/**
 * A persona per workspace, NOT one admin for everything.
 *
 * An admin can reach all three workspaces (FL 2.1-02), but they own no tasks of
 * their own, so `/crp/developer` renders the "no review tasks yet" empty state and
 * the grid — the widest thing on the page and the whole reason to measure it —
 * never exists. Each workspace is measured as the person who actually has data
 * in it.
 */
const AS = {
  developer: 'hiruni.wijethilaka@sebsaworld.com',
  reviewer: 'pinsara.chandika@sebsaworld.com',
  admin: 'charith.widanapathirana@sebsaworld.com',
} as const;

/** Phone, tablet, laptop, desktop, and the two wide cases the container caps. */
const WIDTHS = [320, 768, 1024, 1440, 1920, 2560] as const;

interface Route {
  name: string;
  path: string;
  as: keyof typeof AS;
  /** A selector that only appears once the screen's real content has loaded. */
  ready: string;
}

/** Task ids are seeded by the mock database (`src/mocks/db.ts`). */
const ROUTES: Route[] = [
  { name: 'Home', path: '/', as: 'developer', ready: 'h1' },

  {
    name: 'Developer · My Tasks',
    path: '/crp/developer',
    as: 'developer',
    ready: 'table',
  },
  {
    name: 'Developer · Analytics',
    path: '/crp/developer/analytics',
    as: 'developer',
    ready: 'h1',
  },
  {
    name: 'Developer · Task Details',
    path: '/crp/developer/tasks/t-blom-010',
    as: 'developer',
    ready: 'h1',
  },
  {
    name: 'Wizard · Step 1',
    path: '/crp/developer/tasks/new/details',
    as: 'developer',
    ready: 'h1',
  },
  {
    name: 'Wizard · Step 2',
    path: '/crp/developer/tasks/new/checklist',
    as: 'developer',
    ready: 'h1',
  },
  {
    name: 'Wizard · Step 3',
    path: '/crp/developer/tasks/new/review',
    as: 'developer',
    ready: 'h1',
  },

  {
    name: 'Reviewer · Available',
    path: '/crp/reviewer',
    as: 'reviewer',
    ready: 'table',
  },
  {
    name: 'Reviewer · My Review Tasks',
    path: '/crp/reviewer/my-tasks',
    as: 'reviewer',
    ready: 'h1',
  },
  {
    name: 'Reviewer · History',
    path: '/crp/reviewer/history',
    as: 'reviewer',
    ready: 'h1',
  },
  {
    name: 'Reviewer · Analytics',
    path: '/crp/reviewer/analytics',
    as: 'reviewer',
    ready: 'h1',
  },
  {
    name: 'Reviewer · Review Task',
    path: '/crp/reviewer/tasks/t-blom-010',
    as: 'reviewer',
    ready: 'h1',
  },

  { name: 'Admin · Tasks', path: '/crp/admin', as: 'admin', ready: 'table' },
  {
    name: 'Admin · Users',
    path: '/crp/admin/users',
    as: 'admin',
    ready: 'table',
  },
  {
    name: 'Admin · Customers',
    path: '/crp/admin/customers',
    as: 'admin',
    ready: 'table',
  },
  {
    name: 'Admin · Quality Checklist',
    path: '/crp/admin/checklist',
    as: 'admin',
    ready: 'h1',
  },
  {
    name: 'Admin · Handovers',
    path: '/crp/admin/handovers',
    as: 'admin',
    ready: 'h1',
  },
  // Reviewer Activity and Customer Overview are tab PANELS of this one route,
  // not routes of their own — see the note in `config/routes.ts`.
  {
    name: 'Admin · Reports',
    path: '/crp/admin/reports',
    as: 'admin',
    ready: 'h1',
  },
];

async function signIn(page: Page, as: keyof typeof AS) {
  await page.goto('/login');
  await page.getByLabel(/work email/i).fill(AS[as]);
  await page.getByLabel(/^password/i).fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL('/crp');
}

async function openWizardStep(page: Page, path: string) {
  await page.goto('/crp/developer/tasks/new/details');
  await page.getByRole('combobox', { name: /customer/i }).click();
  await page.getByRole('option', { name: 'AASL' }).click();
  await page.getByLabel(/crim id/i).fill('CRIM-RESPONSIVE');
  await page.getByRole('button', { name: /next: quality checklist/i }).click();
  await page.waitForURL(/\/checklist$/);

  if (path.endsWith('/review')) {
    /*
     * The checkbox itself is `sr-only` and absolutely positioned with no
     * positioned ancestor of its own, so a forced click on it (the pattern
     * used elsewhere, e.g. developer.spec.ts, at desktop widths) can land on
     * the wrong coordinates at narrow viewports. Clicking the visible label
     * text instead triggers the same native input via the browser's normal
     * label click-through, regardless of viewport width.
     */
    await page.getByText('Quick Report', { exact: true }).click();
    const groups = page.getByRole('radiogroup');
    await expect(groups).toHaveCount(9);
    for (let index = 0; index < 9; index += 1) {
      await groups.nth(index).getByRole('radio', { name: 'Yes' }).click();
    }
    await page.getByRole('button', { name: /next: review & submit/i }).click();
    await page.waitForURL(/\/review$/);
  }
}

/**
 * Elements painting wider than the viewport, described well enough to fix.
 *
 * Walks every element rather than trusting `document.scrollingElement`, because
 * the page-level number says only *that* something overflowed. The ancestor
 * chain is what identifies the missing `min-w-0`.
 */
async function overflowingElements(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;

    function describe(element: Element): string {
      const tag = element.tagName.toLowerCase();
      const id = element.id === '' ? '' : `#${element.id}`;
      const classes =
        typeof element.className === 'string' && element.className !== ''
          ? `.${element.className.trim().split(/\s+/).slice(0, 6).join('.')}`
          : '';
      return `${tag}${id}${classes}`;
    }

    // `Array.from`, not a spread: spreading a `NodeListOf` here widens to
    // `any[]` under this tsconfig and every property access after it is unsafe.
    return Array.from(document.querySelectorAll('body *'))
      .filter((element) => {
        const box = element.getBoundingClientRect();
        // 1px of tolerance: sub-pixel rounding on fractional layouts is not a
        // defect, and a real overflow is never one pixel.
        if (box.right <= limit + 1) return false;
        // An element inside its own horizontal scroller is contained by design
        // — that is how the wide grids are meant to behave.
        for (let node = element.parentElement; node !== null; node = node.parentElement) {
          const overflowX = getComputedStyle(node).overflowX;
          if (overflowX === 'auto' || overflowX === 'scroll' || overflowX === 'hidden')
            return false;
        }
        return true;
      })
      .slice(0, 8)
      .map(
        (element) =>
          `${describe(element)} → right ${String(Math.round(element.getBoundingClientRect().right))}px > ${String(limit)}px`,
      );
  });
}

async function pageScrollsHorizontally(page: Page): Promise<number> {
  return page.evaluate(() => {
    const element = document.scrollingElement;
    return element === null ? 0 : element.scrollWidth - element.clientWidth;
  });
}

for (const route of ROUTES) {
  test.describe(route.name, () => {
    for (const width of WIDTHS) {
      test(`fits ${String(width)}px without horizontal scroll`, async ({ page }) => {
        // Twenty routes at six widths is 120 navigations; under parallel
        // workers the heaviest of them (Reports, the review form) run past the
        // default budget on a cold Vite dev server.
        test.slow();

        await page.setViewportSize({ width, height: 900 });
        await signIn(page, route.as);
        if (
          route.path === '/crp/developer/tasks/new/checklist' ||
          route.path === '/crp/developer/tasks/new/review'
        ) {
          await openWizardStep(page, route.path);
        } else {
          await page.goto(route.path);
        }
        await page.locator(route.ready).first().waitFor();

        const offenders = await overflowingElements(page);
        expect(offenders, `elements wider than the ${String(width)}px viewport`).toEqual([]);

        const overflow = await pageScrollsHorizontally(page);
        expect(overflow, `the page scrolls horizontally at ${String(width)}px`).toBeLessThanOrEqual(
          1,
        );
      });
    }
  });
}

test.describe('primary actions stay reachable', () => {
  /**
   * Invariant 2. A control that is technically in the DOM but painted outside
   * the viewport — or under a sticky bar — cannot be used, and no overflow
   * assertion catches that on its own.
   *
   * "Reachable" means reachable AFTER scrolling, which is why each control is
   * scrolled into view first. On a 320px phone the admin toolbars sit below a
   * page header, six stacked counters and a seven-tab strip; asserting they are
   * on screen without scrolling would not be an accessibility bar, it would be
   * a demand that the whole page fit in one screenful.
   */
  const ACTIONS: {
    name: string;
    path: string;
    as: keyof typeof AS;
    action: RegExp;
  }[] = [
    {
      name: 'Developer · My Tasks',
      path: '/crp/developer',
      as: 'developer',
      action: /new review task/i,
    },
    {
      name: 'Wizard · Step 1',
      path: '/crp/developer/tasks/new/details',
      as: 'developer',
      action: /continue|next/i,
    },
    {
      name: 'Admin · Users',
      path: '/crp/admin/users',
      as: 'admin',
      action: /add user/i,
    },
    {
      name: 'Admin · Customers',
      path: '/crp/admin/customers',
      as: 'admin',
      action: /add customer/i,
    },
  ];

  for (const target of ACTIONS) {
    for (const width of [320, 768, 1440] as const) {
      test(`${target.name} at ${String(width)}px`, async ({ page }) => {
        test.slow();
        await page.setViewportSize({ width, height: 900 });
        await signIn(page, target.as);
        await page.goto(target.path);

        const action = page
          .getByRole('button', { name: target.action })
          .or(page.getByRole('link', { name: target.action }))
          .first();

        await action.scrollIntoViewIfNeeded();
        await expect(action).toBeInViewport();

        // And not clipped sideways: `toBeInViewport` passes on an element that
        // is merely intersecting, so a button half off the right edge would
        // slip through.
        const box = await action.boundingBox();
        expect(box, 'the action has no layout box').not.toBeNull();
        expect(box?.x ?? -1, 'the action starts left of the viewport').toBeGreaterThanOrEqual(0);
        expect(
          (box?.x ?? 0) + (box?.width ?? 0),
          'the action is cut off at the right edge',
        ).toBeLessThanOrEqual(width + 1);
      });
    }
  }
});

test.describe('cards in a row share a height', () => {
  /**
   * A grid row of cards must be flush along the bottom at every width.
   *
   * This is the defect that got through the sweep above: the Home workspace
   * cards are each wrapped in a `<Reveal>` for the entry animation, so the
   * REVEAL div is the grid item and receives the stretched row height, while
   * the card inside sized itself to its own text. At `lg` all three share one
   * row and the shortest description left a visibly stubby card; at narrower
   * widths they wrap onto separate rows and nothing looked wrong.
   *
   * No overflow assertion can see this, and neither can jsdom, which computes
   * no layout at all. Only measured boxes catch it.
   */
  // `card` is the card surface: Home cards carry `.rounded-card`, counter cards
  // are toggle buttons. Waiting for it also skips the loading skeleton row.
  const ROWS: { name: string; path: string; as: keyof typeof AS; card: string }[] = [
    // Signed in as the admin, so Home shows all three workspace cards.
    { name: 'Home · workspace cards', path: '/', as: 'admin', card: '.rounded-card' },
    {
      name: 'Developer · counters',
      path: '/crp/developer',
      as: 'developer',
      card: '[aria-pressed]',
    },
    { name: 'Reviewer · counters', path: '/crp/reviewer', as: 'reviewer', card: '[aria-pressed]' },
    { name: 'Admin · counters', path: '/crp/admin', as: 'admin', card: '[aria-pressed]' },
  ];

  for (const row of ROWS) {
    // 1024 is where the Home grid first puts all three cards on one line, and
    // where the mismatch was reported. 1440 covers the full counter rows.
    for (const width of [1024, 1440] as const) {
      test(`${row.name} at ${String(width)}px`, async ({ page }) => {
        test.slow();
        await page.setViewportSize({ width, height: 900 });
        await signIn(page, row.as);
        await page.goto(row.path);
        await page.locator('h1').first().waitFor();
        await page.locator(row.card).first().waitFor();

        const heights = await page.evaluate((surface) => {
          const grids = Array.from(document.querySelectorAll<HTMLElement>('.grid'));
          const cardRow = grids.find(
            (grid) => grid.children.length >= 3 && grid.querySelector(surface) !== null,
          );
          if (cardRow === undefined) return [];

          /*
           * Measure the CARD SURFACE, not the grid child.
           *
           * The grid stretches its children to the row height unconditionally,
           * so comparing those measures nothing — the first version of this
           * test passed with the bug deliberately reintroduced. The card is the
           * surface element: sometimes the grid child itself, sometimes one
           * level down inside an animation wrapper, which is precisely where
           * the height stops being passed on.
           */
          return (
            Array.from(cardRow.children)
              .map((child) => (child.matches(surface) ? child : child.querySelector(surface)))
              .filter((card): card is Element => card !== null)
              // The currently-selected filter card (aria-pressed="true", on the
              // Admin/Reviewer counter rows) carries a deliberate scale-[1.02]
              // emphasis - genuinely a couple of pixels taller by design, not a
              // shared-height defect. Excluded from this comparison rather than
              // from the row itself, so it still counts toward "found a row".
              .filter((card) => card.getAttribute('aria-pressed') !== 'true')
              .map((card) => Math.round(card.getBoundingClientRect().height))
          );
        }, row.card);

        expect(heights.length, 'no row of three or more cards was found').toBeGreaterThanOrEqual(3);

        // Every card in the row reaches the same bottom edge. 1px of tolerance
        // for sub-pixel rounding; a real mismatch is tens of pixels.
        const tallest = Math.max(...heights);
        const shortest = Math.min(...heights);
        expect(
          tallest - shortest,
          `card heights in the row: ${heights.join(', ')}`,
        ).toBeLessThanOrEqual(1);
      });
    }
  }
});
