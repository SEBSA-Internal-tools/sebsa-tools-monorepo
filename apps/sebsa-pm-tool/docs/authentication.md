# Authentication & User Management

How login, signup, admin user management, and privilege groups work in the
SEBSA Internal Project Management Tool. Covers the backend
(`apps/ipm-be/src/app/auth`, `.../users`, `.../departments`,
`.../privilege-groups`, `.../projects`) and the frontend
(`apps/ipm-fe/src/app/features/login`, `.../signup`, `.../admin`).

## Contents

- [Access model](#access-model)
- [Login](#login)
- [Signup (self-registration)](#signup-self-registration)
- [Admin user management](#admin-user-management)
- [Authorization](#authorization)
- [Privilege groups](#privilege-groups)
- [Frontend patterns](#frontend-patterns)
- [Configuration](#configuration)

## Access model

Every account has two independent gates that must both be satisfied to log in:

| Field        | Meaning                                                                 |
| ------------ | ------------------------------------------------------------------------ |
| `approvedAt` | `null` = never approved, cannot log in yet. Set once, permanently (short of deleting the account). |
| `isActive`   | Whether an already-approved account is currently enabled. An admin can flip this off/on repeatedly. |

These are deliberately separate fields, not one overloaded boolean — "this
account was never approved" and "this account was approved, then later
deactivated" are different situations that need different login error
messages and different admin actions to resolve.

Accounts reach `approvedAt` being set in one of two ways:

1. **Self-registration** (`POST /auth/register`) — starts with `approvedAt: null`. An admin must explicitly approve it.
2. **Admin-created** (`POST /users`) — `approvedAt` is set immediately at creation. No separate approval step, since an admin creating the account directly already _is_ the approval.

## Login

`POST /auth/login` → `AuthService.validateUser()`
(`apps/ipm-be/src/app/auth/auth.service.ts`) checks, in order:

1. User exists and isn't soft-deleted → else "Invalid email or password."
2. Password matches (bcrypt) → else "Invalid email or password."
3. `approvedAt` is set → else "Your account is pending administrator approval."
4. `isActive` is true → else "Your account has been deactivated. Contact your System Administrator."

On success, a JWT is issued (`sub`, `email`, `systemRole` claims) via
`@nestjs/jwt`. There is no Passport.js — the guard is hand-rolled.

**`JwtAuthGuard`** (`apps/ipm-be/src/app/auth/jwt-auth.guard.ts`) verifies the
token, then **re-fetches the user from the database on every request**
instead of trusting the token's claims. This means a deactivation takes
effect immediately, on the very next request, rather than waiting out the
token's remaining lifetime (`JWT_EXPIRES_IN`, default 8h).

## Signup (self-registration)

`POST /auth/register` (public, no guard) → `AuthService.register()`:

1. Extract the domain from the submitted email; reject with 403 if it isn't
   in the `SIGNUP_ALLOWED_EMAIL_DOMAINS` allowlist (see
   [Configuration](#configuration)). This is the only thing standing between
   "anyone on the internet" and a database row — there is **no email
   verification step**, since no email-sending infrastructure exists in this
   project. Domain-matching plus mandatory admin approval (next section) is
   the accepted trust boundary for now.
2. Reject with 409 if the email is already registered.
3. Reject with 400 if `departmentId` doesn't reference a real `Department` (populated from the public `GET /departments` endpoint on the signup form).
4. Create the user as `REGULAR_USER`, `isActive: true`, `approvedAt: null`.

The response is a plain confirmation message, not a token — a newly
registered account cannot log in until approved.

Frontend: `apps/ipm-fe/src/app/features/signup/signup.page.ts`, routed at
`/register` (public, alongside `/login`, outside the `authGuard`-protected
shell). Mirrors `LoginPageComponent`'s layout and its signal-based
error-handling pattern. Shows a distinct "pending approval" success state
instead of redirecting to the dashboard.

## Admin user management

All of the following are gated to `ADMIN` or `SUPER_ADMIN` via `JwtAuthGuard`
+ `RolesGuard` + `@Roles('ADMIN', 'SUPER_ADMIN')` on
`apps/ipm-be/src/app/users/users.controller.ts` — the first real usage of
`RolesGuard`/`@Roles()` in this codebase; both existed from the original auth
work but were never wired to a route until the signup/admin feature. `ADMIN`
was originally named `SYSTEM_ADMIN`; renamed when `SUPER_ADMIN` was
introduced above it (see [Authorization](#authorization)) — `SUPER_ADMIN`
inherits every `ADMIN` capability, so both are listed at each gate rather
than teaching `RolesGuard` a hierarchy.

| Endpoint                     | Purpose                                                              |
| ----------------------------- | --------------------------------------------------------------------- |
| `GET /users/pending`          | Self-registered accounts awaiting approval (`approvedAt: null`)      |
| `GET /users/all`               | Every non-deleted account, for the management table                  |
| `POST /users`                  | Admin creates a user directly — auto-approved, returns a **one-time** random temporary password (never emailed, never stored in plaintext) |
| `PATCH /users/:id/approve`     | Sets `approvedAt`, unblocking login for a self-registered account    |
| `PATCH /users/:id/activate`    | Turns `isActive` back on                                              |
| `PATCH /users/:id/deactivate`  | Turns `isActive` off — next request with that user's token is rejected immediately by `JwtAuthGuard`'s live DB re-check |

`POST /users` additionally guards against a plain `ADMIN` granting the
`SUPER_ADMIN` role to anyone (including themselves) — `UsersService.create()`
throws 403 unless the *requesting* user is already `SUPER_ADMIN`. This was a
real gap: since `ADMIN` and `SUPER_ADMIN` are both allowed through the
endpoint's `@Roles()` guard, `SUPER_ADMIN` isn't otherwise a role you can be
granted by anyone lower than the tier itself. The frontend's Create User
dropdown (`admin-users.page.ts`) mirrors this — `SUPER_ADMIN` is filtered out
of the options list for anyone who isn't already logged in as one, so a
plain `ADMIN` never sees the option in the first place.

`GET /users` (no suffix) is a **different, older, non-admin** endpoint —
`?search=` used by the project-member picker. It stays open to any
authenticated user and is unaffected by this feature.

Frontend: `apps/ipm-fe/src/app/features/admin/users/admin-users.page.ts`,
routed at `/admin/users`, guarded by `adminGuard`
(`apps/ipm-fe/src/app/core/guards/admin.guard.ts` — mirrors `authGuard` but
also checks `systemRole` is `ADMIN` or `SUPER_ADMIN`, redirecting non-admins
to `/dashboard` rather than `/login` since they *are* authenticated, just not
authorized). An "Admin" item in `AppShellComponent`'s sidebar is
conditionally shown for both tiers. One HTTP call
(`listAll()`) backs both the "All Users" table and the "Pending Approval"
section — the latter is a `computed()` filter over the former, not a second
round trip.

## Authorization

Two independent layers, not one:

- **`SystemRole`** (`SUPER_ADMIN` / `ADMIN` / `EXECUTIVE` / `REGULAR_USER`) — coarse, fixed, system-wide, checked via `@Roles()` + `RolesGuard`. `SUPER_ADMIN` is strictly additive on top of `ADMIN` — every check that allows `ADMIN` also allows `SUPER_ADMIN` — adding exactly one extra capability: editing the [privilege group](#privilege-groups) library.
- **Project-scoped `Role`** — no longer owns permission flags directly (see below); it references a `PrivilegeGroup` by FK. Checked via private service-layer helpers (`assertCanEdit`, `assertCanManageMembers` in `ProjectsService`), not declarative guards, because the checks depend on route params (which project, which member).

**Creating a project is a `SystemRole`-level gate, not a `PrivilegeGroup` one** — `ProjectsService.assertCanCreateProject()`, restricted to `ADMIN`/`SUPER_ADMIN` (reusing the same `ADMIN_SYSTEM_ROLES` set the other bypass checks use). This had to be a different mechanism than the other two layers: `PrivilegeGroup` permissions only make sense once a `Role`/membership already exists on a project, and creating a brand-new project happens *before* any of that exists. `EXECUTIVE` is deliberately excluded even though it gets cross-project read visibility elsewhere — that tier is read-only by design, not a management capability.

## Privilege groups

Introduced to let permissions be defined once and reused, instead of each
project's `Role` row owning its own copy of the same six booleans
(`canCreateTask`, `canDeleteTask`, `canManageMembers`,
`canConfigureIntegrations`, `canManageWorkflow`, `isReadOnly`). Those flags
now live on a **system-wide `PrivilegeGroup`** model
(`prisma/schema.prisma`); `Role.privilegeGroupId` points at one. Editing a
group's flags changes what every `Role` referencing it can do, without
touching each `Role` individually.

**Who can do what** (a deliberate split, not the only valid one):

- **Defining what a group *means*** (creating groups, editing their flags,
  deleting unused ones) is `SUPER_ADMIN`-only —
  `apps/ipm-be/src/app/privilege-groups/privilege-groups.controller.ts`.
  `GET /privilege-groups` itself is open to any authenticated user (no
  `@Roles()`), since project-level role management needs to read the library
  to populate a picker.
- **Assigning which group a project's role uses** is delegated to whoever
  already manages that project (anyone whose own role's group has
  `canManageMembers`) — `POST /projects/:id/roles` (create a custom role)
  and `PATCH /projects/:id/roles/:roleId` (reassign an existing role's
  group, including the four seeded defaults) on `ProjectsController`.

**Escalation guardrail.** Because assignment is delegated rather than
Super-Admin-only, `ProjectsService.assertNoPrivilegeEscalation()` blocks a
project member from handing out a group with more power than their own
current group on that project — otherwise a Project Manager could grant
themselves stronger access by repointing their own role. For each of the
five capability flags, the candidate group can't be `true` where the
requester's own group is `false`; for `isReadOnly`, a read-only requester can
only assign read-only groups. `ADMIN`/`SUPER_ADMIN` bypass this check
entirely (same pattern as `assertCanEdit`).

**Default groups.** Four groups ship seeded — `Owner Access`, `Manager
Access`, `Member Access`, `Read-Only Access` — matching the flag-sets the
four default roles (`Project Owner`/`Project Manager`/`Member`/`Viewer`)
used to embed directly before this change.
`apps/ipm-be/src/app/projects/constants.ts`'s `DEFAULT_PROJECT_ROLES` now
holds a `privilegeGroupName` per default role; `ProjectsService.create()`
looks the group up by name inside the project-creation transaction rather
than embedding flags.

Frontend: Super-Admin-only management page at
`apps/ipm-fe/src/app/features/admin/privilege-groups/privilege-groups.page.ts`
(`/admin/privilege-groups`, guarded by `superAdminGuard`) for defining
groups; the per-project reassignment/custom-role UI lives in the existing
Team tab (`.../projects/pages/project-detail/components/team/project-team.component.ts`),
since that's where project-level management already happens.

## Frontend patterns

This app runs **without zone.js** and uses `ChangeDetectionStrategy.OnPush`
throughout. Any state set from inside an RxJS `.subscribe()` callback must be
an Angular `signal()`, never a plain mutated class field — a plain field
mutation there won't reliably schedule a re-render. Every component added
across the signup/admin/privilege-groups work follows this: `departments`,
`users`, `groups`, `roles`, `hasError`, `errorMessage`, `isRegistered`, etc.
are all signals; `AdminUsersPageComponent.pendingUsers` and
`ProjectTeamComponent`'s role list are `computed()`/re-fetched from a single
source signal rather than tracked as separate parallel state.

## Configuration

`SIGNUP_ALLOWED_EMAIL_DOMAINS` (`apps/ipm-be/src/config/env.validation.ts`,
`auth.config.ts`) — comma-separated corporate domains allowed to
self-register (e.g. `sebsaworld.com`). **Required, no default** — an
empty/missing value blocks signup entirely rather than silently allowing any
domain, since a misconfiguration here has real security consequences.
