# Sprint Component — Backend Integration Guide

> **Component:** `ProjectSprintComponent`
> **Selector:** `project-sprint`
> **Location:** `pages/project-detail/components/sprint/`
> **Status:** ⚠️ Currently using **mock data** via `BehaviorSubject` in `ProjectsService`.
> This document guides the integration of the real **Sprints backend service**.

---

## Overview

The Sprint component renders all sprints for a given project — displaying their status,
date range, progress, and nested tasks in a collapsible tree view. It also allows
Project Managers (PMs) to create, delete, and update sprint statuses.

The **project context** (project ID and user role) must be derived from the **active session**
rather than being hard-coded or passed arbitrarily. See [Session-Based Project Context](#session-based-project-context) below.

---

## Current State (Mock)

The following methods in `../../../../services/projects.service.ts`
are **still using in-memory `BehaviorSubject` mock data** and must be replaced with real
HTTP calls:

| Method                                 | Current Implementation            | Must Become                          |
|----------------------------------------|-----------------------------------|--------------------------------------|
| `getSprints(projectId)`                | Filters `sprints$` BehaviorSubject | `GET /api/projects/:id/sprints`     |
| `getSprintById(sprintId)`              | Finds in `sprints$` snapshot       | `GET /api/sprints/:sprintId`         |
| `getSprintTasks(sprintId)`             | Filters `tasks$` BehaviorSubject   | `GET /api/sprints/:sprintId/tasks`   |
| `createSprint(formData)`               | Pushes to `sprints$`               | `POST /api/projects/:id/sprints`     |
| `deleteSprint(sprintId)`               | Filters out of `sprints$`          | `DELETE /api/sprints/:sprintId`      |
| `updateSprintStatus(sprintId, status)` | Maps over `sprints$`               | `PATCH /api/sprints/:sprintId`       |

---

## Session-Based Project Context

The `projectId` and `userRole` must come from the **authenticated session**, not from
static values. Here is the integration approach:

### 1. Project ID — from Route + Session

The parent page (`ProjectDetailPageComponent`) already reads the project ID from the
route parameter and loads the full `Project` object via the backend:

```typescript
// project-detail.page.ts  (already implemented)
ngOnInit(): void {
  const projectId = this.route.snapshot.paramMap.get('id');
  this.projectsService.getProject(projectId).subscribe(project => {
    this.project.set(project);   // signal<Project | null>
  });
}
```

The `projectId` is then passed down to this component via `@Input()`:

```html
<!-- project-detail.page.html -->
<project-sprint [projectId]="project()!.id" />
```

> ✅ **No change needed** for project ID — it already flows from the session-resolved
> project object. Do **not** read `projectId` from `localStorage` or issue a separate API call.

---

### 2. User Role — from Auth Session

The component currently hard-codes the role to `'PM'` via a signal:

```typescript
// ❌ Current (mock) — line 35 of project-sprint.component.ts
userRole = signal<UserRole>('PM');
```

This **must be replaced** with the authenticated user's role for the current project,
resolved from the session.

#### Integration Steps

**Step A — Inject the Auth service** (adjust path to match your `core/` structure):

```typescript
import { AuthService } from '@sebsa-pm-tool/core';

private authService = inject(AuthService);
```

**Step B — Inject the new `SprintService`** (see [New SprintService](#new-sprintservice)):

```typescript
import { SprintService } from '../../../../services/sprint.service';

private sprintService = inject(SprintService);
```

**Step C — Resolve the role on `ngOnInit`** using the project members endpoint
(already available in `ProjectsService`):

```typescript
ngOnInit(): void {
  const currentUserId = this.authService.getCurrentUserId();

  // Resolve role from session against the project member list
  this.projectsService.getMembers(this.projectId).subscribe(members => {
    const me = members.find(m => m.userId === currentUserId);
    const role = me?.role ?? 'VIEWER';
    this.userRole.set(role === 'PM' || role === 'PROJECT_MANAGER' ? 'PM' : 'DEVELOPER');
  });

  this.loadSprints();
}
```

> **Role mapping reference:**
>
> | Backend Role Value            | Frontend `UserRole` |
> |-------------------------------|---------------------|
> | `PM` / `PROJECT_MANAGER`      | `'PM'`              |
> | `DEVELOPER` / `CONSULTANT`    | `'DEVELOPER'`       |
> | anything else / not a member  | `'VIEWER'`          |

---

## New `SprintService`

Create a dedicated service to keep sprint HTTP calls separate from `ProjectsService`.

**File to create:**
`apps/ipm-fe/src/app/features/projects/services/sprint.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Sprint, Task } from './projects.service';

export interface CreateSprintRequest {
  name: string;
  startDate: string;    // ISO date string e.g. "2024-02-01"
  endDate: string;
  description?: string;
}

export interface UpdateSprintRequest {
  status?: 'planned' | 'active' | 'completed';
  name?: string;
  startDate?: string;
  endDate?: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class SprintService {
  private readonly http = inject(HttpClient);

  /** Get all sprints for a project */
  getSprints(projectId: string): Observable<Sprint[]> {
    return this.http.get<Sprint[]>(`/api/projects/${projectId}/sprints`);
  }

  /** Get a single sprint by its ID */
  getSprintById(sprintId: string): Observable<Sprint> {
    return this.http.get<Sprint>(`/api/sprints/${sprintId}`);
  }

  /** Get all tasks that belong to a sprint */
  getSprintTasks(sprintId: string): Observable<Task[]> {
    return this.http.get<Task[]>(`/api/sprints/${sprintId}/tasks`);
  }

  /** Create a new sprint under a project */
  createSprint(projectId: string, dto: CreateSprintRequest): Observable<Sprint> {
    return this.http.post<Sprint>(`/api/projects/${projectId}/sprints`, dto);
  }

  /** Update sprint fields or lifecycle status */
  updateSprint(sprintId: string, dto: UpdateSprintRequest): Observable<Sprint> {
    return this.http.patch<Sprint>(`/api/sprints/${sprintId}`, dto);
  }

  /** Delete a sprint — backend should unassign its tasks */
  deleteSprint(sprintId: string): Observable<void> {
    return this.http.delete<void>(`/api/sprints/${sprintId}`);
  }
}
```

---

## Component Integration Checklist

Make the following changes to `project-sprint.component.ts`:

- [ ] **Inject `SprintService`** (new) — replace all mock sprint calls on `ProjectsService`
- [ ] **Inject `AuthService`** — resolve the current user's project role at init
- [ ] **Update `loadSprints()`** — call `SprintService.getSprints(projectId)` (returns `Observable<Sprint[]>`); store result in the `sprints` signal
- [ ] **Update `getSprintTasks()`** — call `SprintService.getSprintTasks(sprintId)`; consider loading tasks per sprint on expand or eagerly in `loadSprints()`
- [ ] **Update `onAddSprint()`** — call `SprintService.createSprint(projectId, formData)` and reload sprint list on success
- [ ] **Update `onDeleteSprint()`** — call `SprintService.deleteSprint(sprintId)` and reload on success
- [ ] **Update `onUpdateSprintStatus()`** — call `SprintService.updateSprint(sprintId, { status })` and reload on success
- [ ] **Add `isLoading` and `errorMessage` signals** to the component to handle HTTP in-flight state and failures
- [ ] **Remove mock `sprints$` and `tasks$` BehaviorSubjects** from `ProjectsService` once all feature tabs (Sprint, Kanban, Task List) have been migrated

---

## Data Models

### `Sprint`
Currently defined in `projects.service.ts`. Move to `@sebsa-pm-tool/shared-models` once stable.

```typescript
interface Sprint {
  id: string;
  name: string;
  projectId: string;
  status: 'planned' | 'active' | 'completed';
  startDate: string;    // ISO date string
  endDate: string;
  description?: string;
  createdAt: string;
  tasks?: Task[];       // optionally populated via ?include=tasks query param
}
```

### `Task` — key field for sprint association

```typescript
interface Task {
  id: string;           // e.g. "PMT-089"
  title: string;
  category: string;
  status: 'new' | 'todo' | 'inprogress' | 'done';
  priority: 'High' | 'Medium' | 'Low';
  duration: string;
  assignee?: string;
  dueDate: string;
  projectId: string;
  sprintId?: string;    // links a task to its sprint — must be in backend schema
}
```

---

## Expected API Endpoints

Provide this table to the backend team:

| Method   | Endpoint                           | Description                                | Auth / Role      |
|----------|------------------------------------|--------------------------------------------|------------------|
| `GET`    | `/api/projects/:id/sprints`        | List all sprints for a project             | Any project member |
| `POST`   | `/api/projects/:id/sprints`        | Create a new sprint                        | PM only          |
| `GET`    | `/api/sprints/:sprintId`           | Get a single sprint by ID                  | Any project member |
| `PATCH`  | `/api/sprints/:sprintId`           | Update sprint name / dates / status        | PM only          |
| `DELETE` | `/api/sprints/:sprintId`           | Delete sprint (backend unassigns its tasks)| PM only          |
| `GET`    | `/api/sprints/:sprintId/tasks`     | Get tasks belonging to a sprint            | Any project member |

> **Security note:** The backend must validate that the requesting user is a member of
> the project the sprint belongs to. The `projectId` stored on the sprint record should
> be cross-checked against the session before returning data, to prevent cross-project
> data exposure.

---

## Component Inputs (Current)

| Name        | Type     | Direction | Description                                                   |
|-------------|----------|-----------|---------------------------------------------------------------|
| `projectId` | `string` | `@Input`  | Passed from the parent page (already session-resolved). Do not source this independently inside this component. |

*No `@Output` events are currently defined. Add them if the parent page needs to react
to sprint lifecycle events (e.g., sprint activated, sprint completed).*

---

## Developer Notes

- **Role gating is UI-only**: The `isPM()` / `canAddSprint()` checks show/hide buttons.
  The backend must **also** enforce these permissions — never rely solely on frontend role checks.
- **Auto-expand on active:** Active sprints (`status === 'active'`) are expanded by default
  on load. This logic is in `loadSprints()` and should be preserved after the real data migration.
- **Progress bar** is computed client-side: `Math.round((done / total) * 100)`. This can
  remain client-side once `getSprintTasks()` returns real data.
- **`AddSprintModalComponent`** (`components/modals/add-sprint/`) also needs updating to
  call `SprintService.createSprint()` instead of `ProjectsService.createSprint()`.
- When a sprint is deleted, the backend is responsible for dissociating tasks (`sprintId = null`).
  The frontend should re-fetch affected tasks after a successful delete.

---

*Last updated: 2026-08-10 | Feature: Sprint | Module: `features/projects`*
