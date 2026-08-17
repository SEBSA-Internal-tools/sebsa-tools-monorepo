# Component architecture

## Two tiers

Every shared component is in exactly one of two folders, and the difference is
enforced by ESLint rather than by review.

| | `src/components/ui/` | `src/components/common/` |
| --- | --- | --- |
| Knows about | Nothing but React, Radix, CVA | App constants, content, routing, queries |
| May import `@/*` | **No** | Yes |
| May import a portal | No | **No** |
| Data | Props only | May fetch |
| Examples | `Button`, `Table`, `Stepper`, `NotificationPanel` | `AppBar`, `PageHeader`, `NotificationCenter`, `UserMenu` |

The `ui` restriction is the important one:

```js
files: ["src/components/ui/**/*.{ts,tsx}"]
// bans @/*, @sdp/contracts, @sdp/types,
//      react-router-dom, @tanstack/react-query, zustand, msw
```

A design system that cannot import the app is portal-agnostic **by
construction** — which is what will let Delivery and Wiki adopt it unchanged
rather than forking it.

Feature-specific components (`TaskTable`, `Step1TaskDetails`) are neither tier;
they live in their feature's `components/` folder. Promote one only when a
second consumer actually exists.

## The design system

`src/components/ui/` — 22 folders:

| Folder | Contents |
| --- | --- |
| `AppBar` | `AppBarShell`, `HomeIconButton`, `NotificationBell`, brand lockup |
| `Badge` | Status and count badges |
| `Button` | `Button` (5 variants × 3 sizes, icon slots, `asChild`), `IconButton` |
| `Card` | `Card` and its parts; `WorkspaceCard`; `MetricCard` |
| `Chart` | Recharts wrappers with the legend/label rules baked in |
| `Checklist` | `ChecklistQuestionCard`, group headers, progress |
| `DataTable` | TanStack Table 8 over `Table` + `Pagination` |
| `EmptyState` | Icon + title + description + optional action |
| `FeedbackCard` | Configurable colour and size |
| `Form` | `Field`, `Input`, `Textarea`, `Select`, `Checkbox`, `RadioGroup` |
| `Notification` | `NotificationItem`, `NotificationList`, `NotificationPanel` |
| `Overlay` | `Dialog`, `Popover`, `Tooltip`, `Toast` host |
| `Primitives` | `Avatar`, `Separator`, `ScrollArea`, `Progress`, `Skeleton` |
| `Screenshot` | `FileDropzone`, `ScreenshotCard` |
| `SegmentedRadioGroup` | Radio buttons rendered as a button group |
| `StatCard` | Metric, delta, icon |
| `Stepper` | Five-or-more-step wizard indicator |
| `Table` | `Table` parts + `Pagination` (page size, range, prev/next) |
| `Tabs` | Radix tabs, styled |
| `Typography` | `Heading`, `Text`, `TextWithIcon` |
| `EmptyState`, `lib` | plus `cn()` and shared variant helpers |

### Anatomy of a component folder

```
Button/
  Button.tsx          the component
  variants.ts         CVA config, exported for reuse
  Button.test.tsx     behaviour
  Button.stories.tsx  every variant, plus interaction play functions
```

Not all four exist for every component, but a shared component without a story
is incomplete — see [Storybook standards](./21-storybook-standards.md).

## Rules for a `ui` component

1. **Props in, events out.** No fetching, no navigation, no global state.
2. **Forward the ref** on anything that wraps a DOM element.
3. **Spread the rest.** `...props` onto the root so callers can pass `aria-*`,
   `data-*` and `id`.
4. **Accept `className`** and merge it with `cn()`, so a caller can adjust
   layout without a wrapper div.
5. **No copy.** Every string is a prop. `NotificationPanel` takes `title`,
   `unreadLabel` and an `emptyState` node — none of it is hardcoded, which is
   what makes it portal-agnostic.
6. **Accessible by default.** A component should not require the caller to
   remember an `aria-label` to be correct. Where a label genuinely varies, make
   it a required prop.
7. **Variants over booleans.** `variant="danger"`, not `isDanger`.

## Composition over configuration

`DataTable` composes the existing `Table` and `Pagination` rather than
reimplementing them. Both were already built and tested; wrapping them means the
table markup, the pagination behaviour and their accessibility tests have one
implementation.

The same rule applies upward: if a feature needs a table with filters, it
composes `DataTable` — it does not add a `filters` prop to it.

## Accessibility built in

- `Button` renders a real `<button>`, or the child element under `asChild`.
- `DataTable` headers carry `aria-sort`; clickable rows are keyboard-operable
  (`role="button"`, `tabIndex={0}`, Enter and Space) and carry a `rowLabel`.
- `Stepper` is an `<ol aria-label>`, **not** a `<nav>` — a progress indicator is
  not navigation, and a second `<nav>` breaks `landmark-unique`.
- `NotificationPanel` signals unread with a dot **and** a heavier title **and**
  visually hidden text, never colour alone.

Every story runs axe at `error` severity, so a regression fails the build.

## Adding a component

1. Does something similar exist? Extend it before adding.
2. Which tier? If it needs `@/…`, it is `common/`. If a feature is its only
   consumer, it belongs to that feature.
3. Create the folder with the component, variants, test and story.
4. Export from `src/components/ui/index.ts` if it is `ui`.
5. Run `npm run test:storybook` — the axe gate is part of the definition of done.
