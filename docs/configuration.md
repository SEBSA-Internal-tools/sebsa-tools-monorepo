# Global Configuration

The lists behind project/case/task dropdowns and status badges — types, statuses
and priorities — are rows in one table, editable by Super Admin, rather than
values baked into the schema.

---

## Why one table

`config_options` holds every list, discriminated by `kind`:

| Kind | Replaces |
| --- | --- |
| `PROJECT_TYPE` | `ProjectType` enum |
| `PROJECT_STATUS` | `ProjectStatus` enum |
| `CASE_TYPE` | `CaseType` enum |
| `CASE_STATUS` | `CaseStatus` enum |
| `TASK_STATUS` | `TaskStatus` enum |
| `SUBTASK_STATUS` | `SubtaskStatus` enum |
| `PRIORITY` | the per-project `ProjectPriority` table |
| `TASK_TYPE` | the global `task_types` table |
| `SUBTASK_TYPE` | the global `subtask_types` table |
| `COMPLEXITY_LEVEL` | the `task_complexity_levels` table, now nested via `parentId` |

Nine near-identical lists managed by the same screen, the same endpoints and the
same rules. Separate tables would mean writing all of that nine times, and a
tenth list later would mean writing it again.

## Scope

`scope` is `GLOBAL` or `CSO`. CSO projects draw from the CSO list; every other
project draws from `GLOBAL`. The two are fully independent rows — CSO can have
its own "Critical" with a different colour and position, renamed or removed
without touching the global one.

This is what lets the same Angular component serve both the System screen and
the CSO tab with nothing but a different `scope` input.

## `key` vs `label`

Every row has both, and the distinction is the reason this is safe to ship:

- **`key`** is the stable identifier application logic matches on — `DONE`,
  `IN_PROGRESS`. It is written once and never changes.
- **`label`** is the display text. Renaming "To Do" to "Backlog" changes only
  what users see.

Seeded rows carry the original enum value as their key, so the ~130 places in
the codebase that compare against `'DONE'` keep working unchanged while the
display side becomes configurable.

New entries get a key derived from their label (`In Review` → `IN_REVIEW`),
uppercased and underscored, with a conflict check against the same kind+scope.

## Semantic flags

Logic that needs to ask "is this finished?" should read the flags rather than
match a key, so an admin-created status behaves correctly without a code change:

- `isDefault` — what a new record starts as. One per kind+scope; setting a new
  one clears the previous inside the same transaction.
- `isCompleted` — counts as finished in rollups and dashboards.
- `isCancelled` — counts as abandoned.

These only apply to status lists; setting them on a type or priority is rejected.

## `isSystem`

Seeded rows are marked `isSystem`. They can be renamed, recoloured, reordered
and deactivated — but **not deleted**, because application logic still matches
on their keys. Admin-created rows carry no such restriction.

Two further guards: the default entry cannot be deactivated or deleted while it
is still the default, since new records would have nothing to fall back to.

## API

`/api/config-options`. Reads are open to any authenticated user because the
whole UI renders from them; every write is `SUPER_ADMIN`.

| Route | Notes |
| --- | --- |
| `GET /` | `?scope=` (default `GLOBAL`), `?kind=`, `?includeInactive=true` |
| `POST /` | Appends to the end of its list |
| `PATCH /:id` | Label, colour, flags |
| `PATCH /reorder/:kind/:scope` | Whole list, one transaction |
| `DELETE /:id` | Admin-created entries only |

Reordering replaces the entire ordering in a single transaction and rejects a
list that does not name every entry exactly once — a partial reorder would leave
two entries sharing a position.

## The migration

`20260917095602_add_global_config_options` is purely additive: it creates the
table and seeds it, touching no existing column.

Statuses and types are seeded for **both** scopes from the current enum values.
Priorities are derived from the live data — each scope takes the distinct
priority names actually used by the projects it covers, so nothing in use is
lost. A scope with no projects falls back to Low/Medium/High/Critical.

Because per-project orderings differed, the merged priority ordering is
arbitrary and is expected to be corrected once in the UI.

## The screens

One component, `ConfigurationPanelComponent` (`core/components/configuration-panel/`),
takes a `scope` input and is mounted twice:

| Where | Scope | Who |
| --- | --- | --- |
| System → Configuration (`/admin/configuration`) | `GLOBAL` | Super Admin |
| CSO → Configuration tab | `CSO` | Super Admin |

Reads are open to any authenticated user, so a non-admin opening the screen sees
the lists read-only with a notice rather than an error. Every mutating control
is hidden behind the same check the API enforces.

The panel lists deactivated entries too (`includeInactive=true`) — an admin has
to be able to see what they switched off in order to switch it back on.

Each row shows its immutable `key` beneath the label, so an admin renaming an
entry can see what the code still refers to. Built-in rows show a lock instead
of a delete button.

Ordered lists — statuses and priorities — are reordered by dragging a row onto
the position it should take. Type lists are not draggable: a set of choices has
no meaningful sequence. The drag sends the whole resulting order because the API
rejects a partial list, and the row moves optimistically so the list does not
jump while the request is in flight.

Edit is a pen, hide/show is an eye that reflects current state, and delete is a
bin. Built-in entries show a padlock where delete would be.

**The per-project Configuration tab has been removed.** `ProjectConfiguration`
and its files are deleted; priorities are no longer configured per project.

---

## Still to do

The entity columns are **not yet converted**. `Project.status`, `Case.status`,
`Task.status`, `Subtask.status`, `Project.type`, `Case.type` remain enum
columns, and `Case.priorityId`/`Task.priorityId` still reference
`project_priorities`.

So today an admin can rename, recolour, reorder and deactivate every entry, and
those changes surface everywhere the UI reads config from. **Adding a brand-new
status and assigning it to a record needs the column migration**, which is:

1. Add nullable FK columns alongside the enums, backfill by matching `key`.
2. Move the ~34 backend and ~6 frontend logic comparisons onto the semantic
   flags; the ~23 frontend display switches are replaced by the config rows.
3. Drop the enum columns once the app is proven on the new ones.

Kept separate deliberately — it rewrites the workflow columns, and the additive
half above is independently useful and independently safe.

### Nested entries

Complexity levels belong to a task type rather than to a list, so they are child
rows: `parentId` points at their task type and `kind` is `COMPLEXITY_LEVEL`.
`GET /api/config-options` returns top-level entries unless `parentId` is
supplied, so a task-type list is never polluted by the levels beneath it.

`TaskTypesService.listComplexityLevels()` fetches them for the selected type in
the task screens. They have no management UI yet — the old Task Types admin page
that owned it has been removed, and a nested editor in the Configuration panel is
the natural home. Nothing is lost: the table was empty and no task referenced a
level.
