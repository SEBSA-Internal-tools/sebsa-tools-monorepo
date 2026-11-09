# Permissions

Two independent layers. Both are enforced server-side; the Angular route guards
only avoid loading a page that would fail.

---

## Layer 1 — system role

`SystemRole` on the user: `SUPER_ADMIN`, `ADMIN`, `EXECUTIVE`, `REGULAR_USER`.

- **ADMIN / SUPER_ADMIN** bypass every project check.
- **EXECUTIVE** can *see* every project without being a member, but has no write
  grant — visibility and permission are separate questions.
- **REGULAR_USER** sees and does only what project membership allows.

Some endpoints are gated at the class level with `@Roles('SUPER_ADMIN')` — the
audit log and the configuration write routes — so a route added there cannot
accidentally skip the check.

## Layer 2 — project membership

A user joins a project as a `ProjectMember` holding a `Role`. Each role points
at a shared `PrivilegeGroup`, which carries the actual flags. Editing a group
changes what every role pointing at it can do, across every project.

Four groups are seeded and every new project gets four roles wired to them:
Project Owner, Project Manager, Member, Viewer.

---

## The flags

`isReadOnly` is a **master deny**: when set, every write is refused whatever
else is ticked. It is not a grant, so it is excluded from `PROJECT_PERMISSIONS`
and handled separately.

| Grant | Covers |
| --- | --- |
| `canCreateCase` / `canEditCase` / `canDeleteCase` | Cases |
| `canCreateTask` / `canEditTask` / `canDeleteTask` | Tasks **and subtasks** |
| `canComment` | Posting, editing and deleting comments |
| `canManageMembers` | Adding/removing members, creating and assigning roles |
| `canManageSprints` | Sprint create/update/delete |
| `canManageLabels` | Label definitions |
| `canConfigureIntegrations` | Linking a project or case to Jira |

Tasks and subtasks deliberately share grants — a subtask is a unit of its task,
not a separately permissioned thing.

### What changed, and why nobody's access moved

The original six flags did not describe what the application can do:
`canCreateTask`/`canDeleteTask` gated **cases as well as tasks**, subtasks and
comments were governed only by `isReadOnly`, and `canManageWorkflow` covered
sprints and labels together.

The migration **derives** every new value from the old ones rather than
assigning per group name, so each existing group kept exactly the permissions it
already had:

```
canCreateCase    = canCreateTask      (the old flag gated both)
canDeleteCase    = canDeleteTask
canEditCase      = NOT isReadOnly     (editing was only ever gated by this)
canEditTask      = NOT isReadOnly
canComment       = NOT isReadOnly
canManageSprints = canManageWorkflow
canManageLabels  = canManageWorkflow
```

---

## Where it is enforced

`ProjectAccessService` (`app/common/`) is the only place project permissions are
decided:

```ts
await this.access.assertVisible(projectId, user);
await this.access.assertCan(projectId, user, 'canDeleteCase');
```

It is provided by a `@Global()` module, so services inject it without importing
anything.

Before this, every domain service carried its own copy of these checks — thirteen
near-identical helpers across five services. That is exactly how the two drifted
apart: cases and tasks grew granular flags while subtasks and comments were left
on a bare `isReadOnly` check. One implementation means a new grant is enforced
everywhere it is used, the moment it is used.

`PROJECT_PERMISSIONS` lists every grant once. The privilege-escalation guard in
`ProjectsService` iterates it rather than naming flags by hand, so adding a flag
cannot silently open a path to granting more than you hold.

Refusals name the action: *"You do not have permission to delete cases in this
project."*

## Roles

Roles are per-project and can be created, renamed and repointed at a different
privilege group. Deleting one is refused while any member still holds it —
reassigning those people is a decision for a human, not a silent side effect —
and the four seeded defaults cannot be deleted at all, so every project keeps a
usable set.

**Escalation guard:** you cannot assign a privilege group carrying a grant you
do not hold yourself, nor move someone out of read-only if you are read-only.

## Not covered by a flag

Attachments and the activity log have no dedicated grant. Attachments follow the
case or task they hang off; the activity feed follows project visibility. Add a
flag when someone needs them controlled separately — one entry in
`PROJECT_PERMISSIONS`, one in the schema, one in the editor's section list.
