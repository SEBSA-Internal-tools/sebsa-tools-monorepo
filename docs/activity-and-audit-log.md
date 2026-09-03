# Activity Log & Audit Trail

Two views over one table. `ActivityLog` (see
[database-architecture.md](database-architecture.md)) is the single immutable,
append-only ledger; the **activity feed** is a project/case/task/subtask-scoped
slice of it, and the **audit log** is the unscoped view for Super Admins.

Keeping them on one table means an action is recorded once and read two ways —
there is no second write path that can drift from the first.

---

## Writing entries

`ActivityLogsService.record()` appends one entry. It takes an optional
transaction client as its second argument:

```ts
await this.prisma.$transaction(async (tx) => {
  await tx.task.update({ where: { id }, data: { ... } });

  await this.activityLogs.record(
    {
      projectId: existing.case.projectId,
      entityType: EntityType.TASK,
      entityId: id,
      entityLabel: task.title,
      action: ActivityAction.STATUS_CHANGED,
      actorId: user.id,
      description: `Moved task "${task.title}" from ${existing.status} to ${task.status}`,
      changes,
    },
    tx,
  );
});
```

Three rules hold everywhere entries are written:

1. **Always pass `tx`.** The entry must commit or roll back with the mutation it
   describes. A trail that disagrees with the data it audits is worse than no
   trail, so `record()` does not swallow write failures either.
2. **Always set `projectId`** for anything inside a project. The project feed
   reads the indexed `projectId` column rather than enumerating descendants, so
   an entry missing it disappears from the project view.
3. **Always set `entityLabel`.** It stores the entity's name as it stood at
   write time, so the trail stays readable after a rename or a soft delete.

### Field-level changes

`buildFieldChanges(before, dto)` reduces a DTO to the fields it actually
changes, producing `{ field, from, to }` triples stored under
`metadata.changes`. Keys the caller left `undefined` are untouched and skipped;
an explicit `null` counts as a real change. This is what turns an opaque
"updated" entry into `dueDate: 2026-09-12 → 2026-09-19`.

### Status changes

`CaseStatusHistory` and `TaskStatusHistory` remain the authoritative
per-dimension status timelines and are unchanged. A status move additionally
writes one `STATUS_CHANGED` entry to the ledger so it shows up in the
cross-entity feed. A single request produces a single entry — other fields
edited in the same call ride along in `changes` rather than generating a second
row.

### What is instrumented

| Entity  | Actions recorded |
| ------- | ---------------- |
| Project | `CREATED`, `UPDATED`, `STATUS_CHANGED`, `DELETED` |
| Project member | `MEMBER_ADDED`, `MEMBER_REMOVED`, `ROLE_CHANGED` |
| Case    | `CREATED`, `UPDATED`, `STATUS_CHANGED`, `DELETED`, `ASSIGNED`, `UNASSIGNED` |
| Task    | `CREATED`, `UPDATED`, `STATUS_CHANGED`, `DELETED`, `ASSIGNED`, `UNASSIGNED` |
| Subtask | `CREATED`, `UPDATED`, `STATUS_CHANGED`, `DELETED`, `ASSIGNED`, `UNASSIGNED` |

Sprints, comments, attachments and label attach/detach are not instrumented
yet. The `ActivityAction` enum already carries values for them.

---

## Reading: the scoped feed

`GET /api/activity-logs/{projects|cases|tasks|subtasks}/:id`

Each route resolves the owning project and applies the same visibility rule as
the entity itself, so a feed never exposes activity from a project the caller
cannot open.

A feed covers the entity **and everything beneath it**: a case feed includes its
tasks and their subtasks. Descendants are collected without filtering on
`deletedAt` — the history of a task that was later deleted is exactly what the
feed exists to show.

Query parameters: `action`, `actorId`, `page`, `limit` (max 100, default 20).

The `ActivityFeedComponent` (`core/components/activity-feed/`) renders any of
these. It takes `entityType` and `entityId` and pages in on demand:

```html
<app-activity-feed entityType="CASE" [entityId]="kase.id"></app-activity-feed>
```

It is mounted on the project detail Activity tab, the case detail page, and the
task detail page.

---

## Reading: the audit trail

`GET /api/audit-logs` — the whole ledger, unfiltered by project membership.

Restricted to `SUPER_ADMIN` at the controller class level, so no route added to
`AuditLogsController` can accidentally skip that gate. The Angular route carries
`superAdminGuard`, but that only avoids loading a page that would fail — the API
is the actual boundary.

Filters (all optional, combinable): `entityType`, `entityId`, `action`,
`actorId`, `projectId`, `search` (case-insensitive match on the description),
`dateFrom`, `dateTo`, plus `page` and `limit` (max 100, default 50).

`GET /api/audit-logs/filters` returns the actors and projects that actually
appear in the log, along with the full entity-type and action lists, so the UI
populates its dropdowns from real data instead of hard-coding them.

The screen lives at `/admin/audit-logs` and appears in the sidebar for Super
Admins only.

---

## Adding a new instrumented action

1. Confirm the action exists in the `ActivityAction` enum in
   `prisma/schema.prisma`; add it there first if not.
2. Call `activityLogs.record()` inside the mutation's transaction, following the
   three rules above.
3. If it needs a new icon or colour in the feed, add it to `ACTION_ICONS` and
   `ACTION_TONES` in `activity-feed.component.ts` — both are exhaustive
   `Record<ActivityAction, string>` maps, so a missing entry is a compile error
   rather than a silent fallback.
