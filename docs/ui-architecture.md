# SEBSA workspace UI architecture

Version 3 ? Updated 15 October 2026

## Design direction

SEBSA is a working environment for projects, cases, and tasks. The interface should put ownership, progress, and next actions ahead of decoration. Use quiet surfaces, readable labels, compact controls, and a restrained violet accent. This guide supersedes the previous Luminous Depth glassmorphism direction.

## Research and application

The following official product references were reviewed on 15 October 2026. The applications below are design interpretations, not claims that SEBSA implements feature parity.

| Reference | Documented pattern | SEBSA application |
| --- | --- | --- |
| [Asana navigation](https://help.asana.com/s/article/navigating-asana) | Sidebar navigation and a header containing actions and views for the current work | Stable sidebar, visible workspace context, shorter My work label |
| [Linear display options](https://linear.app/docs/display-options) | View-specific display settings and configurable issue properties | Reduce visual competition around task content and keep properties in a separate column |
| [Linear custom views](https://linear.app/docs/custom-views) | Filtered issue and project views | Preserve existing filters and task/case views; prioritize their visibility over large banners |
| [Jira features](https://www.atlassian.com/software/jira/features) | Boards and timelines support different planning contexts | Preserve the existing project views and status workflows within a consistent shell |

These references support the information architecture. Typography, spacing, borders, and color choices below are SEBSA-specific design decisions.

## Source of truth

Global tokens live in apps/ipm-fe/src/styles.scss. Component SCSS owns layout. Prefer semantic tokens over literal colors. Existing legacy token aliases remain supported so older screens inherit the theme.

| Role | Token / guidance |
| --- | --- |
| Canvas | --surface-page: light neutral canvas; dark navy in dark mode |
| Content surface | --surface-card |
| Secondary surface | --surface-muted |
| Brand/action | --brand-primary: #635bdb in light mode; lighter violet in dark mode |
| Heading/body | --text-heading / --text-primary |
| Supporting copy | --text-secondary; --text-muted for lower emphasis |
| Dividers | --border-default / --border-subtle |
| Typography | Inter with system sans-serif fallback; monospace for identifiers |
| Elevation | Subtle card shadow; reserve stronger elevation for floating elements |

Do not apply gradients to navigation text. Use color and background together for active navigation, and retain aria-current. Status must remain understandable from its label, not color alone.

## Shell and navigation

The desktop sidebar is 236px with the existing 78px collapsed mode. It uses themed surfaces and a divider, a workspace caption, and a prominent New Case action. Role-based visibility and administrative grouping remain intact. The header provides a workspace home link, theme control, notifications, and account actions. Mobile navigation retains its drawer and backdrop.

## Page hierarchy

Use one clear page title, a short supporting sentence when useful, then working controls and content. Shared cards use 12px corners with restrained elevation. Avoid repeatedly nesting tinted panels inside cards. Tables and project lists should favor scanning, aligned metadata, and predictable actions. Do not animate decorative indicators continuously.

## Task details

The task editor separates primary content from a 300px property column on wide screens. Description and subtask sections use dividers rather than nested tinted cards. Below 1024px the properties stack without a vertical divider. The header reports saving and unsaved states alongside the existing explicit Save and Discard controls. Editing remains explicit: changing a field does not imply autosave. Task title, description, priority, type, and complexity controls have accessible names. Status buttons expose their selected state through aria-pressed.

## Interaction and accessibility

- Preserve a visible focus indicator on links, buttons, and fields.
- Honor prefers-reduced-motion across transitions and animations.
- Keep destructive actions labeled and visually distinct.
- Preserve existing loading, empty, permission, and error behavior.
- Keep mobile inputs readable and controls reachable; avoid horizontal page overflow.
- Verify light/dark modes and desktop/mobile layouts with populated and empty data before release.

## Implementation scope

This revision updates the shared foundation and shell, task editor, and selected dashboard, project-list, and assigned-work surfaces. It does not add new boards, search engines, reporting capabilities, or keyboard shortcuts. Remaining feature-specific styling should migrate incrementally to these same tokens. A production build validates compilation; authenticated visual and usability review is still required before claiming the whole product has been validated.

## Red and green review: orientation, focus, trust

The second design pass treats the interface as a work environment rather than a set of independently styled screens. The red review challenged navigation context, repeated metrics, nested interactive controls, and misleading success feedback. The green implementation makes the following changes:

- Orientation: current-section context appears in the shell; parent navigation remains active on detail routes.
- Focus: priority work precedes portfolio summaries; the dashboard introduction no longer duplicates summary metrics.
- Native navigation: task and project titles are real links with separate completion and deletion actions.
- Trust: task completion is pending until server confirmation, and failures remain actionable with an inline explanation. An unavailable priority queue is distinct from an empty queue.
- Editing: status changes explicitly save immediately, use their own pending state, and keep the draft editor visible. Other fields retain explicit Save and Discard.

The subsequent cross-screen pass adds dirty-navigation protection, dependency disclosure, accessible project-view selection, and generic account fallbacks. Authenticated visual evaluation across representative viewport sizes remains required before claiming complete usability validation.

## Cross-screen implementation coverage

Shared page gutters, panel/control/dialog corners, neutral colors, and missing legacy token aliases now form the common foundation. Global forced card/list/table painting has been removed; low-specificity .sebsa-table defaults allow configuration, calendars, and individual data tables to retain appropriate layouts. Components own horizontal scrolling.

| Screen family | Applied treatment |
| --- | --- |
| Login and registration | Compact branding, natural page scrolling, theme-aware surfaces and inputs; registration labels/autocomplete corrected |
| Dashboard | Priority-first hierarchy, condensed introduction, native work links, confirmed completion and explicit queue-unavailable state |
| Projects and project views | Theme surfaces, compact corners, title links, result feedback, accessible view selection |
| Customers and customer details | Shared typography, page gutters, neutral surfaces, restrained headers and borders |
| Assigned work, task and case details | Consistent gutters, clear editing feedback, protected unsaved changes; progressive dependency form on tasks |
| CSO board, queue, overview and KPI dashboard | Shared typography and spacing, themed neutral surfaces, paired semantic status chips |
| Calendar, notifications, activity and settings | Shared page gutters, typography, corners and neutral surface treatment |
| Users, departments, privilege groups, audit logs and configuration | Shared canvas/gutters, component-owned data tables, keyboard-scrollable administration tables |
| Shared controls and creation dialogs | Common corner/surface vocabulary; dropdown arrow/Home/End navigation and predictable focus return |

Validation includes production compilation and focused tests for completion success/failure/retry, dirty-navigation protection, and dropdown keyboard/focus behavior. Browser discovery returned no connected browser surface, so authenticated visual validation at desktop/mobile sizes remains unverified. No production data or permission configuration was changed.

## Purple identity and login redesign

IFS describes its identity as a vibrant purple-led palette ([official announcement](https://www.ifs.com/en/insights/news/ifs-refreshes-its-brand-ahead-of-milestone-launch)). SEBSA adopts an inspired purple family: primary #8427e2, hover #7020c4, deep plum #360065, and supporting lilac #cd92ff. These are SEBSA implementation choices, not a claim of current IFS brand certification or affiliation. Muted violet neutrals carry through light and dark surfaces. White on the primary purple exceeds WCAG AA normal-text contrast; lilac is reserved for dark decorative surfaces.

The new login uses a deep-plum editorial panel with a static, decorative projects/cases/tasks motif and a focused form panel. Mobile hides the motif and reduces branding. Auth inputs retain explicit labels and autocomplete; password visibility remains keyboard accessible; loading is announced. Account requests remain linked to registration. The nonfunctional Microsoft action and mouse spotlight have been removed.

Solid primary actions use --brand-action and --brand-action-hover; those fills stay deep purple in both themes for white-label contrast. The separate --brand-primary token can become lighter in dark mode for readable links and accents.

## Dashboard redesign and metric definitions

Dashboards share quiet neutral panels, compact headings, tabular figures, restrained purple actions and exception-only warning colors. The shared DashboardInsightsComponent presents a label, value, denominator/context, and a native drill-down link when an actual item is available. Secondary CSO charts use a native disclosure; exact creation-cohort counts are available as a table.

| Dashboard | Primary insight and scope |
| --- | --- |
| Main portfolio | Weighted completed-task share from returned task counts; flagged live projects; live projects without tasks. The separate priority queue shows at most five tasks and is explicitly labeled as limited. |
| CSO My work / Management | Open, overdue, unassigned, upcoming seven-day cases. Personal scope uses assignee IDs, including multi-assignee cases; management retains its role gate. |
| CSO project board | The same case snapshot plus accessible CSO projects and native project links. Independent project/case loading and errors prevent failed loads looking empty. |
| Project overview | Case snapshot, actual completed count, separate cancellations, blockers and valid-date coverage. Status/priority/age evidence is hidden until case loading succeeds. Sprint loading is independent. |
| Customer detail | Active projects, nonterminal projects past their target date, and cases across loaded customer projects. Failed project requests do not show zero-valued insights. |

### Calculation rules

- Open means status is neither DONE nor CANCELLED. Completed means DONE only. Cancellation is never credited as completed work.
- Overdue means an open item with a valid due date earlier than the snapshot time. Missing dates are excluded from that denominator. Upcoming means now through seven days ahead.
- Date coverage is valid dated open cases divided by all open cases. No open cases yields N/A, not 100%.
- Age uses valid creation timestamps at or before the snapshot. Missing/invalid/future creation dates do not receive invented ages.
- Creation cohorts show the current open population grouped by creation date; they are not historical backlog or resolution rates. Weekly buckets are clipped to the selected 7/30/90-day window. Customer monthly cohorts also use creation dates.
- Joined assignee names describe assignment groups, not individual capacity, effort, or who completed the case.
- SLA, resolution-duration, CSAT, and budget claims have been removed from these analytical views where supporting fields are unavailable. Existing project health flags remain explicitly rule-based. Overdue and blocked flag counts can overlap.
- CSO requests carry a version guard so stale filtered requests cannot overwrite a newer dashboard snapshot. Unavailable data and incomplete customer labels have explicit feedback.

Validation adds metric-boundary, missing-data, cancellation, request-race, personal-scope, date-window, creation-cohort, and project/sprint loading tests. Authenticated populated desktop/mobile visual verification remains outstanding because the session has no connected browser.
