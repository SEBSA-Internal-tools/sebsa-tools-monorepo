# MVP Completion Roadmap & Work Breakdown

**Scope:** Close out the FSD v1.4 MVP and deliver the FSD v1.5 Customer Success
Organization (CSO) / Jira sync requirement — **full sync scope for CSO tasks**,
including live webhooks, conflict resolution, and retry/backoff. Confirmed as
highest priority even if scoped to CSO tasks only.
**Window:** 12 working days (2 weeks + 2 extra days).
**Team:** 5 developers.
**Prepared:** based on a verified audit of `main`, `feature/projects-module`,
and both FSD documents — not an estimate from memory. See
[Current State](#current-state-verified) for exactly what that audit found.

---

## Read this first: the honest scope call (revised)

12 working days × 5 developers is **60 person-days** — 10 more than the
original 10-day/50-day plan. That extra 10 is exactly what's needed to
upgrade Track E from the descoped on-demand sync to the **full §5.17 spec**
(inbound Jira webhooks, last-write-wins conflict resolution logged to the
Activity Log, retry-with-backoff on failure, a periodic reconciliation poll)
— provided the resourcing below is followed, not just the timeline.

**What actually changes, not just the calendar:**

1. **Track B becomes two-phase.** Days 1-5: Workflow Stage + Sprints backend
   (unchanged from before). Days 6-12: shifts onto Track E full-time as a
   second Jira-integration engineer. This is the real reason full scope fits
   — Track E effectively becomes a 2-person team for the hardest half of the
   work (webhooks, conflict resolution, retry queue), not a solo effort
   stretched thinner.
2. **Days 11-12 (the 2 new days) are dedicated QA + demo prep for the whole
   system**, not just CSO — see the [timeline](#day-by-day-timeline). This is
   in direct response to "we definitely need to test this and prepare it for
   a demo," not an afterthought tacked onto Day 10.
3. **External prerequisites need to be arranged before Day 1**, or Track E
   loses days waiting on them (this is the same category of thing as the
   Neon/GitHub account setup earlier in this project — I can't create these
   for you, someone needs to do it in advance):
   - A Jira Cloud site to develop and test against (a free trial/sandbox site is fine — do **not** point development work at a real customer's live Jira board).
   - An Atlassian OAuth 2.0 app registration (or API token) for that site.
   - A publicly reachable URL for the backend during development, so Jira Cloud can actually deliver webhook POSTs to it — `localhost` will not work. Either a tunnel (ngrok or similar) for local dev, or deploying `ipm-be` somewhere reachable. Worth deciding this in the Day-1 kickoff, since it affects how Track E (and B, from Day 6) actually test their own work all the way through.

**Residual honesty check:** "full spec" here means the mechanisms
(webhooks, conflict resolution, retry queue, reconciliation poll) are real
and working, exercised against a sandbox Jira site. It does not mean
production-hardened against every edge case (Jira rate limits under heavy
load, exotic multi-user simultaneous-edit races, etc.) — that level of
confidence normally comes from weeks of real usage, not a 12-day build. Say
that distinction out loud in the demo too; it's a materially different and
more honest claim than "not done at all," and the CSO team should hear it
either way.

---

## Current State (verified)

Checked directly against the repo, not assumed:

| Area | State | Where |
|---|---|---|
| Database schema, Docker→Neon migration | Done | `main` |
| Auth (login, JWT, guards, roles scaffold) | Done | `main` |
| Projects CRUD + default roles/workflow-stage seeding + Members | Done, **not merged to `main`** | `feature/projects-module` |
| Users search | Done, **not merged to `main`** | `feature/projects-module` |
| Tasks (backend API) | **Not started** — `Task` table exists, zero endpoints | — |
| Sprints (backend API) | **Not started** — `Sprint` table exists, zero endpoints | — |
| Comments / mentions | **Not started** | — |
| Notifications | **Not started** | — |
| Activity Log | **Not started** — table exists, nothing writes to it | — |
| Workflow stage editing (post-creation) | **Not started** — stages are seeded once at project creation, no edit/reorder API | — |
| Kanban board, Task List tab, Sprint tab | UI shell exists, **100% mock data** in `ProjectsService` | `feature/projects-module` |
| My Tasks / Calendar / Notifications pages | **Literal placeholder text**, no logic at all | `main` |
| Dashboard | UI built, **100% mock data**, no `HttpClient` anywhere in the feature | `main` (via `feature/dashboard`, merged) |
| Customer entity, CSO flag, CSO Overview, Jira sync | **Does not exist in any form** — brand new in v1.5 | — |

**Day-1 action before anything else:** `feature/projects-module` must be
reviewed and merged into `main`. It's the single biggest piece of finished,
verified work sitting unmerged, and Tasks/Sprints/Kanban all need to build on
top of the real `Project`/`ProjectMember`/`Role` API it adds, not the mock
one still in `main`.

---

## What changed in v1.5

Diffed directly against v1.4. Net-new:

- **Workflow Configuration screen** — Project Owners/PMs can add/rename/reorder/remove a project's workflow stages after creation (today this only happens once, automatically, at project creation).
- **Customer entity** — deliberately lightweight: name + linked projects, not a CRM.
- **CSO Project flag** — a project can be linked to a Customer + a specific Jira Cloud project/board.
- **CSO task label** — *any* task, in *any* project, can be individually tagged "CSO" and synced to Jira independently of whether its parent project is a full CSO Project.
- **CSO Overview page** — cross-project list of every CSO-flagged task, filterable by project/customer/priority/status/assignee; tasks can be created directly from here.
- **Status/Flow Stepper** — a visual "where is this task in the workflow" stepper on the task detail page. Applies to **every** task, not just CSO — this is a general MVP improvement that CSO happens to need too.
- **Jira sync (§5.17)** — Jira Cloud REST API + webhooks, status/field mapping configured once per CSO Project, last-write-wins conflict resolution logged to the Activity Log, soft-delete-only propagation both directions, retry-with-backoff on failure, a Sync Failure Alert notification.
- **No new roles** — the spec explicitly says CSO introduces no new system- or project-level roles; visibility follows the user's existing role on whichever project the task belongs to. One less thing to build.

---

## Priority tiers

**P0 — the tool doesn't function as a PM tool without these.** Tasks are the
actual product. Nothing else in this document matters if Tasks isn't real.

**P1 — needed for a coherent MVP**, not just a task tracker: Sprints,
Comments, Notifications, a real Dashboard.

**P2 — the v1.5 CSO/Jira requirement**, full sync scope for CSO tasks
(confirmed highest priority, resourced with 2 developers from Day 6 — see
[Track E](#track-e--cso--jira-2-developers-from-day-6-highest-priority)).

Lower-priority MVP-scope items *not* in this two-week window and explicitly
deferred: Calendar view, global Search/Filter/Saved Views, Milestones,
Integrations beyond Jira (Slack/Teams/GitHub/Drive), hard delete, API tokens.
None of these block CSO or the core task workflow.

---

## Work Breakdown by Track

Five developers, five tracks — though Track B folds into Track E from Day 6
(see below), so think of it as four tracks for the second half. Tracks B and
C are backend→frontend pairs on the *same* entities (Tasks, Workflow/Sprints)
— sequence matters within a track more than across tracks. Track E is
intentionally isolated through Day 5 so it doesn't get blocked by, or block,
the rest of the team while the CSO groundwork gets built.

### Track A — Tasks Backend (1 developer, critical path)

Everything else depends on this. Start immediately, Day 1, no dependencies.

- `TasksModule`: `POST/GET/PATCH/DELETE /projects/:id/tasks`, `GET/PATCH /tasks/:id`
- Fields: title, description, type, priority, assignee(s), due/start date, story points, parent task (subtask support), workflow stage
- `TaskAssignee` (multi-assignee), `TaskLabel` join to existing `Label` model
- `TaskDependency` (Blocks/Relates To/Duplicate Of) + circular-dependency check
- `TaskStatusHistory` write on every stage transition (this is also what feeds the Status/Flow Stepper and the time-in-stage requirement from v1.4)
- Reuse the permission-check pattern already established in `ProjectsService` (`assertCanEdit`-style helpers, not a new guard)

**Depends on:** `feature/projects-module` merged (needs real `Project`/`WorkflowStage`/`Role`).
**Blocks:** Track C entirely; Track D's Comments (comments hang off tasks) and Dashboard aggregation; Track E's CSO labeling.

### Track B — Workflow Stages & Sprints Backend, then Jira (1 developer, two-phase)

**Phase 1 (Days 1-5):**
- Workflow Stage CRUD: add/rename/reorder/remove stages on an existing project (`PATCH /projects/:id/workflow-stages`), permission-gated on `canManageWorkflow`
- Guard against removing a stage that still has tasks in it (reassign-or-block)
- `SprintsModule`: create/start/complete sprint, backlog view, "max one active sprint" (mirrors the partial-unique-index pattern already used for `ProjectMember`)
- Sprint↔Task assignment endpoint

**Phase 2 (Days 6-12): joins Track E full-time.** This is not "help if
there's time" — it's scheduled. See [Track E](#track-e--cso--jira-2-developers-from-day-6-highest-priority)
for the split of work between the two once merged.

**Depends on:** `feature/projects-module` merged.
**Blocks (Phase 1):** Track C's Sprint tab; Track E's Jira status-mapping config (needs a stable Workflow Stage API to map Jira statuses onto).

### Track C — Task/Sprint Frontend (1 developer)

Real backend replaces the mock `ProjectsService` arrays entirely for this
surface area.

- Kanban board: real drag-drop against Track A's stage-transition endpoint
- Task List tab, My Tasks page (currently a placeholder — this is its first real implementation)
- Sprint tab against Track B's API
- Status/Flow Stepper component (new in v1.5, applies to every task)
- Also owns: resolving the merge of `feature/projects-module`'s frontend into `main` (Day 1, before this track's real work starts — it's mostly mechanical, same pattern as the conflicts already resolved once on `feature/authentication`)

**Depends on:** agree on Task/Sprint DTO shapes with Tracks A/B on Day 1 (don't wait for the backend to be finished — build against the agreed contract, same as how the frontend was built against `shared-models` types throughout this project). Real integration happens as each endpoint lands, not all at once at the end.

### Track D — Collaboration & Dashboard (1 developer)

- Comments backend + frontend (threaded replies, @mention using the existing `CommentMention` model)
- Notifications backend + frontend — in-app only (bell icon, unread count); email/Slack/Teams explicitly out of scope for this window
- Notification triggers: task assigned, status change on watched/assigned task, @mention
- Dashboard: replace `features/dashboard`'s mock services with real aggregation queries once Tasks/Projects data exists to aggregate

**Depends on:** Track A (Comments hang off Task; Notifications trigger off Task events; Dashboard aggregates Task+Project data) — this track's early days should be spent on Comments' UI shell and Notification preference UI (unblocked), backend wiring follows as Track A's API stabilizes.

### Track E — CSO & Jira (2 developers from Day 6, highest priority)

Solo through Days 1-5 (the CSO entities/UI groundwork, none of which is
externally dependent), then joined full-time by Track B for Days 6-12 to
build the sync engine itself — the part that actually needs two people, since
webhooks, conflict resolution, and a retry queue are three fairly independent
pieces of machinery that can be built in parallel once the schema and Jira
client groundwork exist.

**Schema additions needed** (new migration, own this early — Day 1-2):
- `Customer` model: `id`, `name`, relation to `Project[]`
- `Project`: add `isCsoProject`, `customerId?`, `jiraProjectKey?`, `jiraSiteUrl?`
- `Task`: add `isCsoLabeled`, `jiraIssueKey?`, `jiraLastSyncedAt?`, `jiraSyncStatus?` (enum: `SYNCED`/`PENDING`/`FAILED`)
- A status-mapping table: `(workflowStageId, jiraStatusName)` pairs per project
- A small `JiraSyncQueue`-style table (or reuse pattern) for the retry/backoff queue: entity reference, attempt count, next-attempt-at, last error
- Reuse the existing `ActivityLog` (not a new table) for sync history — the spec explicitly wants sync-sourced changes in the same audit trail as everything else, tagged with source (`PMT` or `JIRA`)
- `@nestjs/schedule` (new dependency) for the reconciliation poll's cron job

**Days 1-5 (solo, CSO groundwork — unaffected by the scope change):**
1. Customer entity CRUD
2. CSO Project flag + linking UI (depends on Customer + Track A's Project work being mergeable)
3. CSO task label + CSO Overview page (cross-project filtered list — depends on Track A's Task API existing)
4. Workflow-to-Jira status mapping config screen (depends on Track B's Workflow Stage API, so this lands late in the Days 1-5 window, right as Track B is about to switch over)
5. Jira Cloud REST API client + OAuth/API-token auth against the sandbox site — get one issue created/updated from PMT manually end-to-end before Day 6, so the two-person push starting Day 6 has a working foundation instead of starting from zero

**Days 6-12 (2 developers — split by mechanism, not by day):**
- **Sync engine owner (original Track E dev):** outbound sync (PMT → Jira create/update/soft-delete-as-cancelled), the reconciliation poll (`@nestjs/schedule` cron comparing PMT/Jira state on an interval as a backstop), and the on-task/on-project sync-status UI (issue key, last-synced time, failed indicator).
- **Inbound + resilience owner (Track B dev):** Jira webhook endpoint (issue created/updated/deleted → update PMT task, respecting the same status/field mapping), last-write-wins conflict resolution (compare timestamps, write the losing side's discarded change to `ActivityLog` with source tagging so it's auditable, not silently dropped), and the retry-with-exponential-backoff queue for failed syncs in either direction.
- Both pair explicitly on the failure-handling contract (what counts as a failure, what gets retried vs. surfaced immediately) before splitting off to build in parallel — this is the piece most likely to produce integration bugs if built independently without agreeing the contract first.
- Sync Failure Alert notification (depends on Track D's Notification infrastructure existing — coordinate timing, should be ready by Day 6-7).

**Test explicitly, don't just build:** by Day 9, run the full loop for real
against the sandbox Jira site — create a task in PMT and confirm it appears
in Jira; edit the Jira issue and confirm it flows back to PMT via webhook;
kill the network/break auth mid-sync and confirm the retry queue picks it up;
edit both sides near-simultaneously and confirm the conflict resolution
behaves as documented and logs both changes.

---

## Day-by-Day Timeline

| Day | A (Tasks BE) | B (Workflow/Sprints → Jira) | C (Task/Sprint FE) | D (Collab/Dashboard) | E (CSO/Jira) |
|---|---|---|---|---|---|
| 1 | Merge `feature/projects-module`→`main` (whole team reviews); Task schema finalization + DTOs agreed with C | Same merge; Workflow Stage API design | Resolve FE half of the merge; Kanban/Task-list scaffolding against agreed DTOs | Comments UI shell (unblocked); Notification preference UI | Customer entity CRUD + CSO schema migration |
| 2 | Task CRUD + assignment endpoints | Workflow Stage CRUD | Wire Kanban to real stages (once B ships) | Comments backend | CSO Project flag (schema + link UI) |
| 3 | Task labels, subtasks, dependencies | Sprint CRUD | Task List tab; My Tasks page real data | Comments integration; Notification triggers start | CSO Overview page (list only, no Jira yet) |
| 4 | `TaskStatusHistory` write-through | Sprint↔Task assignment; "one active sprint" constraint | Sprint tab wiring | Notification backend (in-app) | CSO task labeling UI; workflow-mapping screen (Workflow API now ready) |
| 5 | Buffer / bugfix; start Activity Log helper other tracks can call | Wrap Sprints; Jira sandbox site + OAuth app confirmed working, hand off | Status/Flow Stepper component | Notification frontend (bell, unread count) | Jira API client + auth; one issue created/updated manually end-to-end by EOD |
| — | **Mid-point check-in: demo Tasks + Kanban end-to-end, AND confirm the manual Jira round-trip works. Both are gates — if either isn't real by end of Day 5, re-plan before continuing into the Track E two-person push.** | | | | |
| 6 | Activity Log write-through across A's own endpoints | **Joins Track E.** Pair with E on the failure-handling contract (what's retried vs. surfaced); start webhook endpoint | Polish Kanban drag-drop; fix integration bugs from Day 1-5 | Dashboard: wire summary cards to real Project/Task counts | Outbound sync: task create/update → Jira issue create/update |
| 7 | Help Track D wire Activity Log into Comments/Notifications | Webhook: Jira issue update → PMT task update, via status/field mapping | Comments UI polish (with D) | Dashboard: activity feed, workload view | Reconciliation poll (`@nestjs/schedule` cron); sync-status UI on task |
| 8 | Cross-track integration testing (core MVP) | Last-write-wins conflict resolution + `ActivityLog` source-tagging | Cross-track integration testing (core MVP) | Dashboard: health indicators | Soft-delete propagation both directions |
| 9 | Available to help Track E/B test the Jira loop | Retry-with-backoff queue for failed syncs | Sync-status UI polish; CSO Overview real Jira data | Sync Failure Alert notification + manual retry action (with B/E) | Full loop test: create/edit both sides, kill network mid-sync, simultaneous-edit conflict — per the [test list](#track-e--cso--jira-2-developers-from-day-6-highest-priority) |
| 10 | Bug bash (whole team, cross-assigned to *not* their own track) | Bug bash | Bug bash | Bug bash | Bug bash + fix issues found in Day 9's real test pass |
| — | **Day 11 — QA day, whole team.** Full regression pass across every track, not just each person testing their own work: someone who didn't build Comments tests Comments, someone who didn't build Jira sync tests the full sync loop again independently. Fix what's found; don't just log it for later. | | | | |
| — | **Day 12 — Demo prep, whole team.** Rehearse the actual demo script end-to-end at least twice, including a live CSO task synced to the sandbox Jira board in front of whoever's watching the rehearsal. Fix anything that breaks. Freeze scope once it's rehearsed clean — no new changes between the final rehearsal and the real demo. | | | | |

---

## Process notes (the "how", not just the "what")

- **Branch per track**, off `main` — same pattern already established
  (`feature/authentication`, `feature/projects-module`). Merge to `main`
  frequently (every 1-2 days once Day-1 stabilizes), not once at the end —
  the conflict-resolution pain already seen a few times in this project's
  history gets worse the longer branches diverge, and five people diverging
  for ten days simultaneously is a real risk.
- **Agree on DTO/API shapes before the backend is finished.** This project
  already has the pattern for it: `libs/shared-models` holds plain
  interfaces both frontend and backend import, exactly like `Project`/
  `ProjectSummary`/`AuthUser` today. Tracks A/C and B/C should write the
  `libs/shared-models/src/lib/tasks/` and `.../sprints/` types together on
  Day 1 before either side writes implementation code.
- **OnPush + no zone.js is a hard constraint already discovered the hard
  way** (a real rendering bug shipped and got caught only by manual browser
  testing during the auth work): any component state set from an HTTP
  response must be an Angular `signal`, never a plain field mutated inside
  `.subscribe()`. Put this in the PR template or say it out loud in the
  Day-1 kickoff — it's not obvious and it silently fails rather than erroring.
- **Soft-delete and permission-check conventions are already established**
  (`assertCanEdit`, `assertCanManageMembers` style helpers in
  `ProjectsService`) — new modules should follow the same shape rather than
  inventing a new pattern per track.
- **The Day-5 checkpoint is load-bearing, not decorative — and it's now two
  gates, not one:** Tasks + Kanban demoable end-to-end, *and* one Jira issue
  successfully created/updated manually against the sandbox site. Track E's
  Days 6-12 plan assumes both are true going in. If either isn't real by end
  of Day 5, that's the moment to cut scope — and given Jira is the now
  confirmed highest priority, the thing to trim first is Track D (Comments/
  Notifications/Dashboard polish), not Track E. Don't silently let it slip
  and discover it on Day 11.

---

## What "done" looks like at the end of Day 12

A user can: log in, see a real dashboard, create a project, see its
FSD-default workflow stages (and edit them), create tasks and subtasks,
assign them, move them across a real Kanban board, comment and @mention,
get notified in-app, run a sprint, and — for CSO work — flag a project or an
individual task as CSO, link it to a customer and a Jira board, and have that
task **stay in sync with Jira both directions, automatically**: edits in
either PMT or Jira propagate to the other, conflicting simultaneous edits
resolve by last-write-wins with both versions logged to the Activity Log,
failed syncs retry automatically with backoff, and a periodic reconciliation
poll catches anything a missed webhook would otherwise drop.

What's still honestly out of scope, and worth saying to the CSO team rather
than implying it doesn't exist: this has been built and tested against a
*sandbox* Jira site over 12 days, not battle-tested against months of real
customer usage. Jira Server/Data Center is explicitly out of the FSD's scope
too (Cloud only). Say the [residual honesty check](#read-this-first-the-honest-scope-call-revised)
out loud during the demo — it's a true, still-good story ("the mechanism is
real and complete, it just hasn't accumulated production mileage yet"), and
it's a materially different claim from "not built."

### Suggested demo script (for Day 12 rehearsal)

1. Log in, show the real dashboard.
2. Create a project, show its workflow stages, edit one (rename/reorder) —
   demonstrates the new Workflow Configuration screen.
3. Create a task, assign it, move it across the Kanban board, comment with
   an @mention, show the resulting in-app notification.
4. Flag the project (or an individual task in a *different*, non-CSO
   project — worth showing both paths since the spec explicitly supports
   both) as CSO, link it to a Customer and the sandbox Jira board.
5. Create/update the task in PMT — switch to the Jira sandbox site live and
   show the issue appear/update.
6. Update the *Jira* issue directly — switch back to PMT and show it flow
   back via the webhook, no manual refresh needed if the frontend polls or
   pushes updates, otherwise a manual refresh is fine to state plainly.
7. If comfortable doing it live: trigger a sync failure (e.g., briefly break
   the Jira credentials) and show the Sync Failure Alert + manual retry —
   this is the single most convincing "we actually built the hard part"
   moment, worth the small live-demo risk if the rehearsal on Day 12 went
   clean twice in a row.
