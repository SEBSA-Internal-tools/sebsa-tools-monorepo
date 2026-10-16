# Soft deletes

A soft-deleted row stays in the table with `deletedAt` set, and every read
filters it out. Nothing in the UI changes — the record simply disappears —
but the history it carries survives, and the row can be brought back by
clearing one column.

There is deliberately **no restore UI**. Recovery today is a deliberate
database operation, which is the right friction for something that should be
rare.

---

## What soft-deletes

| Model | What would otherwise be lost |
| --- | --- |
| `Project` | Everything below it |
| `Case` / `Task` / `Subtask` | The work record and its activity trail |
| `Comment` | Thread continuity — replies would orphan |
| `User` | Authorship of everything they ever created |
| `Customer` | Which customer a finished project was for |
| `ProjectMember` | Who contributed, and when |
| `Milestone` | The delivery record cases were measured against |
| `Sprint` | The planning record cases were scheduled into |
| `Label` | Silent removal from every task and case it was applied to |
| `Attachment` | The record that a file was ever uploaded |

## What deliberately hard-deletes

**Join rows** — `caseAssignee`, `taskAssignee`, `subtaskAssignee`,
`caseLabel`, `taskLabel`, `commentMention`, `taskDependency`.

These are set membership, not records. The code replaces the set wholesale
(`deleteMany` then `createMany`), so a `deletedAt` here would mean every read
filtering it, every re-add hunting for a tombstone to revive, and a unique
constraint that has to ignore dead rows. The failure it buys is concrete:
*re-assigning someone who was previously removed silently does nothing.* And
it recovers nothing — who was assigned when is already in `activity_logs`.

**Rows protected another way:**

- `Role` — deletion is refused while any member holds it, and the four seeded
  defaults cannot be deleted at all.
- `ConfigOption` — has `isActive` as its hide-don't-delete switch, and
  built-ins are blocked outright.
- `PrivilegeGroup`, `ProjectPriority` — `onDelete: Restrict`, so the database
  refuses while anything references them.
- `Notification` — a user dismissing their own; there is nothing to recover.

---

## The two rules that make it work

### 1. A `deletedAt` column with an unfiltered read is worse than a hard delete

The record looks gone, then reappears in a list, a count, or a dropdown. Every
read of a soft-deleting model must carry `deletedAt: null` — including
**nested** ones, which are the easy miss:

```ts
labels: {
  where: { label: { deletedAt: null } },
  include: { label: { select: { id: true, name: true, color: true } } },
},
```

The same applies to `_count`, which counts tombstones unless told otherwise:

```ts
_count: { select: { cases: { where: { deletedAt: null } } } },
```

A count that includes deleted rows does not just display wrongly — where it
guards a deletion, it blocks that deletion *permanently*. A sprint whose cases
had all been deleted could never itself be removed until this was fixed.

The exception is a count guarding a hard delete behind `onDelete: Restrict` —
`ProjectPriority`, for example. There the count must stay unfiltered, because
the database will refuse the delete whether or not the referencing row is
soft-deleted. Filtering it would replace a clear 400 with a raw FK error.

### 2. Uniqueness must ignore the dead

A deleted row must not keep its name, or its slot, reserved. Prisma cannot
express partial indexes, so these are maintained by hand in the migration and
the generated `@@unique` is dropped from the schema:

```sql
CREATE UNIQUE INDEX "labels_projectId_name_key" ON "labels"("projectId", "name")
  WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "sprints_one_active_per_project" ON "sprints"("projectId")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
```

Consequence worth knowing: the compound `findUnique` no longer exists on the
client for these models. Look them up with `findFirst` plus `deletedAt: null`.

`project_members` uses the same pattern so a removed member can be re-added.

---

## Attachments keep their file

Deleting an attachment marks the row and **leaves the stored file in place**.
Deleting the blob would make the soft delete unrecoverable, which defeats the
point of keeping the row. Purging orphaned files is a separate, deliberate
operation — not a side effect of a user clicking delete.

## Adding a soft delete to a new model

1. `deletedAt DateTime?` on the model, plus an index on `(scopeId, deletedAt)`
   if it is listed by scope.
2. Convert every unique constraint it has to a partial index in the migration.
3. Find **every** read: `grep "prisma\.<model>"`, then grep the model's
   relation name to catch nested includes and `_count` selects in other
   services.
4. Change the delete to an update setting `deletedAt`.

Step 3 is the one that decides whether it works.
