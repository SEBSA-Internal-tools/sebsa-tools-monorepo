# Testing strategy

Four tiers, each answering a different question. A test that answers a question
another tier already answers is a maintenance cost with no return.

| Tier | Question | Tool | Where |
| --- | --- | --- | --- |
| **Unit** | Is this rule correct? | Vitest, jsdom | beside the source |
| **Component** | Does this render and respond correctly? | Vitest + Testing Library | beside the component |
| **Visual & a11y** | Does it look right and is it accessible? | Storybook in Chromium + axe | `*.stories.tsx` |
| **Regression / e2e** | Does the journey work end to end? | Playwright | `e2e/` |

## Running

```bash
npm test               # unit + component (jsdom, fast)
npm run test:watch     # the same, watching
npm run test:coverage  # domain/ is held to 90% statements, 85% branches
npm run test:storybook # every story in Chromium, with axe at error severity
npm run test:e2e       # Playwright
```

`vitest.config.ts` defines two projects — `unit` (jsdom) and `storybook`
(browser). They are separate CI jobs because their costs differ by an order of
magnitude.

## Unit tests — the tier that pays

Every pure function in a `domain/` folder. No rendering, no mocking, no setup.

```ts
it("blocks advancing until every required field is filled", () => {
  const blockers = taskDetailsBlockers({ customerId: "c-1" });
  expect(countUnsatisfied(blockers)).toBe(2);
  expect(canAdvance(blockers)).toBe(false);
});
```

This is where the rules most likely to be wrong live — checklist composition,
review-cycle counting, self-review exclusion, step gating — and testing them
here means a failure names the rule instead of naming a button.

`domain/` carries a 90% coverage threshold. The rest of the app has none on
purpose: a global number would be met by writing tests that assert nothing.

## Component tests

Query by **role and accessible name**, the way a user finds things. If a query
is hard to write, the component is probably hard to use.

```tsx
render(<TaskTable tasks={tasks} />, { wrapper: renderWithProviders });
await user.click(screen.getByRole("button", { name: /next page/i }));
expect(screen.getByText("Showing 11–20 of 24")).toBeInTheDocument();
```

`src/test/renderWithProviders.tsx` supplies QueryClient, MemoryRouter and the
tooltip provider. `src/test/server.ts` exports an MSW node server, deliberately
**not** auto-started — a test file opts in, so a network call nobody expected is
still an error rather than a silently mocked success.

Test behaviour, not implementation. Never assert on a class name or a state
variable.

### jsdom caveat

Radix components that use Pointer Capture (Select, and popovers) need stubs,
which `src/test/setup.ts` installs:

```ts
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
}
```

Without them a Select's options never appear and the test fails for a reason
that has nothing to do with the code.

## Visual and accessibility tests — Storybook

Every story is a test. The browser project renders each one in real Chromium and
runs axe at `error` severity, so an accessibility regression is a red build, not
a warning nobody reads.

Stories also carry `play` functions for interaction:

```ts
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);
  await userEvent.keyboard("{Escape}");
  await expect(canvas.getByRole("button", { name: /notifications/i })).toHaveFocus();
},
```

See [Storybook standards](./21-storybook-standards.md).

## Regression and e2e — Playwright

Real browser, real routing, real MSW.

| Spec | Covers |
| --- | --- |
| `smoke.spec.ts` | The app boots, no console errors, no unexpected 4xx |
| `auth.spec.ts` | Redirect to login, sign in, return to the requested page, session persistence, logout |
| `navigation.spec.ts` | **Every workspace card reaches a rendered page** |
| `notifications.spec.ts` | Bell opens the panel, Escape closes it, focus returns |
| `accessibility.spec.ts` | axe on six routes, including `/login` |

`e2e/fixtures/test.ts` provides `gotoFresh` (resets the seeded database and signs
in, with an optional `userId`), `gotoAnonymous`, and `scanA11y`.

`navigation.spec.ts` exists because three navigation links once pointed at
unmounted paths. That specific defect is now encoded as a test — twice, since
`src/routes/routes.test.ts` catches it without a browser.

## What not to test

- Library behaviour. Radix's focus trap is Radix's problem.
- Styling. That is Storybook's job, visually.
- The same rule at three tiers. Test it once, at the cheapest tier that can see it.
- Implementation details — internal state, private functions, class names.

## Writing a test

Arrange, act, assert. One behaviour per test. The name states the behaviour
("blocks advancing until every required field is filled"), not the mechanism
("returns false"). A failing test's name should be enough to know what broke.
