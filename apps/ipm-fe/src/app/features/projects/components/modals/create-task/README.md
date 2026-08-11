# Create Task Modal — API Integration & Enhancement Guide

> **Component:** `CreateTaskModalComponent`
> **Selector:** `create-task-modal`
> **Location:** `components/modals/create-task/`
> **Status:** ⚠️ Task creation currently calls `ProjectsService.createTask()` which writes
> to an **in-memory `BehaviorSubject`** — no real backend call is made yet.

---

## Table of Contents

1. [Component Overview](#1-component-overview)
2. [Inputs & Outputs](#2-inputs--outputs)
3. [Form Fields Reference](#3-form-fields-reference)
4. [Current State (Mock)](#4-current-state-mock)
5. [API Integration Guide](#5-api-integration-guide)
   - 5.1 [New TaskService](#51-new-taskservice)
   - 5.2 [Assignees — Replace Hardcoded List](#52-assignees--replace-hardcoded-list)
   - 5.3 [Sprints — Replace Mock Lookup](#53-sprints--replace-mock-lookup)
   - 5.4 [Update the Component](#54-update-the-component)
6. [Expected API Endpoints](#6-expected-api-endpoints)
7. [TaskFormData Interface](#7-taskformdata-interface)
8. [Two Usage Modes](#8-two-usage-modes)
9. [Validation Rules](#9-validation-rules)
10. [Future Enhancements](#10-future-enhancements)

---

## 1. Component Overview

`CreateTaskModalComponent` is a shared dialog used across the IPM tool to create a new
task and optionally assign it to a sprint. It supports **two usage modes**:

- **Context-aware mode** — opened from inside a project detail page; `projectId` and
  `projectName` are pre-supplied via `@Input()` and the project field is read-only.
- **Global / standalone mode** — opened without a `projectId`; the user must pick a
  project from a dropdown, which then loads the available sprints for that project.

On submission, the modal emits a `TaskFormData` object via the `(submit)` output event.
The **parent component** is responsible for calling the service and handling the response.

---

## 2. Inputs & Outputs

### Inputs

| Input         | Type      | Default | Description                                                                     |
|---------------|-----------|---------|---------------------------------------------------------------------------------|
| `isOpen`      | `boolean` | `false` | Controls whether the modal is visible                                           |
| `projectId`   | `string`  | `''`    | If provided, locks the project field to this project and loads its sprints     |
| `projectName` | `string`  | `''`    | Display name shown in the read-only project field when `projectId` is set      |

### Outputs

| Output   | Payload        | When it fires                                             |
|----------|----------------|-----------------------------------------------------------|
| `close`  | `void`         | User clicks Cancel, the × button, or the backdrop overlay |
| `submit` | `TaskFormData` | User clicks "Create task" and validation passes           |

---

## 3. Form Fields Reference

| Field         | Control Type     | Required | Default    | Notes                                           |
|---------------|------------------|----------|------------|-------------------------------------------------|
| **Project**   | Read-only / Select | Context-dependent | — | Read-only when `projectId` input is set; dropdown otherwise |
| **Sprint**    | `<select>`       | ❌ No     | `''` (Backlog) | "No sprint (Backlog)" option always present |
| **Task Title**| `<input type="text">` | ✅ Yes | `''`      | Blocked on submit if empty                      |
| **Priority**  | Button group     | ✅ Yes    | `'High'`   | `High` / `Medium` / `Low`                       |
| **Assignee**  | `<select>`       | ❌ No     | `''`       | Currently hardcoded list — see [§5.2](#52-assignees--replace-hardcoded-list) |
| **Due Date**  | `<input type="date">` | ❌ No | `''`     | ISO date string                                 |
| **Description**| `<textarea>`    | ❌ No     | `''`       | 6 rows; accepts acceptance criteria, notes, etc.|

---

## 4. Current State (Mock)

### What is mocked

| Concern                  | Current Implementation                                                        | Must Become              |
|--------------------------|-------------------------------------------------------------------------------|--------------------------|
| **Task creation**        | `ProjectsService.createTask()` pushes to an in-memory `tasks$` BehaviorSubject | `POST /api/tasks`       |
| **Assignee list**        | Hardcoded array of 6 names in the component                                   | `GET /api/projects/:id/members` |
| **Sprint list**          | `ProjectsService.getSprints(projectId)` reads from `sprints$` BehaviorSubject | `GET /api/projects/:id/sprints` |
| **Project list** (global mode) | `ProjectsService.getProjects()` — this **already calls the real backend** (`GET /api/projects`) ✅ | No change needed |

### What is already real

- Loading the project list in global mode already uses `HttpClient` via `ProjectsService.getProjects()`.
- The `projectId` in context-aware mode is resolved from the session via the parent page
  (`ProjectDetailPageComponent`) — this flow is correct and should not change.

---

## 5. API Integration Guide

### 5.1 New `TaskService`

Create a dedicated service to own all task HTTP calls. Keep it separate from
`ProjectsService` to maintain single responsibility.

**File to create:**
`apps/ipm-fe/src/app/features/projects/services/task.service.ts`

```typescript
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Task } from './projects.service';

export interface CreateTaskRequest {
  title: string;
  projectId: string;
  assignee?: string;       // user ID or name — confirm with backend schema
  priority: 'High' | 'Medium' | 'Low';
  dueDate?: string;        // ISO date string e.g. "2024-02-15"
  description?: string;
  sprintId?: string;       // omit or send null for Backlog
  category?: string;       // defaults to 'Development' if not supplied
}

export interface UpdateTaskRequest {
  title?: string;
  status?: 'new' | 'todo' | 'inprogress' | 'done';
  priority?: 'High' | 'Medium' | 'Low';
  assignee?: string;
  dueDate?: string;
  description?: string;
  sprintId?: string | null;  // null to move task to Backlog
  category?: string;
}

@Injectable({ providedIn: 'root' })
export class TaskService {
  private readonly http = inject(HttpClient);

  /** Create a new task in a project */
  createTask(dto: CreateTaskRequest): Observable<Task> {
    return this.http.post<Task>('/api/tasks', dto);
  }

  /** Get all tasks for a project */
  getTasksByProject(projectId: string): Observable<Task[]> {
    return this.http.get<Task[]>(`/api/projects/${projectId}/tasks`);
  }

  /** Get all tasks in a sprint */
  getTasksBySprint(sprintId: string): Observable<Task[]> {
    return this.http.get<Task[]>(`/api/sprints/${sprintId}/tasks`);
  }

  /** Update task fields (status, priority, assignee, etc.) */
  updateTask(taskId: string, dto: UpdateTaskRequest): Observable<Task> {
    return this.http.patch<Task>(`/api/tasks/${taskId}`, dto);
  }

  /** Delete a task */
  deleteTask(taskId: string): Observable<void> {
    return this.http.delete<void>(`/api/tasks/${taskId}`);
  }
}
```

---

### 5.2 Assignees — Replace Hardcoded List

The assignee dropdown currently uses a hardcoded array of 6 names in the component:

```typescript
// ❌ Current (mock) — line 52–59 of create-task-modal.component.ts
availableAssignees = [
  'Sarah Miller', 'James Chen', 'Emma Rodriguez',
  'David Kim', 'Lisa Anderson', 'Michael Brown',
];
```

**Replace with a real member lookup** using the existing `ProjectsService.getMembers()`:

```typescript
// In create-task-modal.component.ts

import { ProjectsService } from '../../../services/projects.service';
import type { ProjectMemberSummary } from '@sebsa-pm-tool/shared-models';

// Add signal
readonly availableAssignees = signal<ProjectMemberSummary[]>([]);

// In ngOnChanges — when the modal opens with a known projectId:
if (this.isOpen && this.projectId) {
  this.projectsService.getMembers(this.projectId).subscribe({
    next: (members) => this.availableAssignees.set(members),
    error: () => this.availableAssignees.set([]),
  });
}
```

Update the HTML template to bind to real member data:

```html
<!-- Update the assignee <select> in the template -->
<select id="assignee" [(ngModel)]="assignee" class="form-select">
  <option value="">Select assignee...</option>
  @for (member of availableAssignees(); track member.userId) {
    <option [value]="member.userId">{{ member.name }}</option>
  }
</select>
```

> **Note:** Change `assignee` in `TaskFormData` from `string` (name) to `string` (user ID)
> once the backend accepts user IDs. Confirm the expected field type with the backend team.

---

### 5.3 Sprints — Replace Mock Lookup

Sprint loading currently uses the mock `BehaviorSubject` in `ProjectsService`:

```typescript
// ❌ Current (mock) — lines 68, 93 of create-task-modal.component.ts
this.availableSprints = this.projectsService.getSprints(this.projectId);
```

**Replace with a real HTTP call** using the new `SprintService`
(see `../sprint/README.md` for the full `SprintService` definition):

```typescript
import { SprintService } from '../../../services/sprint.service';

private sprintService = inject(SprintService);
readonly availableSprints = signal<Sprint[]>([]);

// In ngOnChanges or onProjectSelect:
this.sprintService.getSprints(projectId).subscribe({
  next: (sprints) => this.availableSprints.set(sprints),
  error: () => this.availableSprints.set([]),
});
```

Update the template binding accordingly:

```html
@for (sprint of availableSprints(); track sprint.id) {
  <option [value]="sprint.id">{{ sprint.name }} ({{ sprint.status }})</option>
}
```

---

### 5.4 Update the Component

After creating `TaskService`, update the parent page that handles the `(submit)` event.
The modal itself only **emits** — it does not call the service directly.

**In `project-detail.page.ts`** (and any other parent that uses this modal):

```typescript
import { TaskService } from '../../services/task.service';

private taskService = inject(TaskService);

onCreateTask(formData: TaskFormData): void {
  this.taskService.createTask({
    title: formData.title,
    projectId: formData.projectId,
    assignee: formData.assignee || undefined,
    priority: formData.priority,
    dueDate: formData.dueDate || undefined,
    description: formData.description || undefined,
    sprintId: formData.sprintId || undefined,
  }).subscribe({
    next: () => {
      this.closeTaskModal();
      // Optionally reload tasks or emit an event to refresh child views
    },
    error: () => {
      // Show user-facing error — do not close modal on failure
    },
  });
}
```

> **Important:** Do **not** close the modal on error. Keep it open so the user can
> correct their input or retry without losing data.

---

## 6. Expected API Endpoints

Provide this table to the backend team:

| Method   | Endpoint                        | Description                          | Auth / Role        |
|----------|---------------------------------|--------------------------------------|--------------------|
| `POST`   | `/api/tasks`                    | Create a new task                    | Any project member |
| `GET`    | `/api/projects/:id/tasks`       | List all tasks for a project         | Any project member |
| `GET`    | `/api/sprints/:sprintId/tasks`  | List tasks within a sprint           | Any project member |
| `PATCH`  | `/api/tasks/:taskId`            | Update task (status, assignee, etc.) | Assignee or PM     |
| `DELETE` | `/api/tasks/:taskId`            | Delete a task                        | PM only            |

### Expected `POST /api/tasks` Request Body

```json
{
  "title": "Review legacy data mapping docs",
  "projectId": "954",
  "assignee": "user-id-abc123",
  "priority": "High",
  "dueDate": "2024-02-15",
  "description": "Check the ERD and validate field-level mappings.",
  "sprintId": "SPR-002",
  "category": "Data Migration"
}
```

### Expected `POST /api/tasks` Response Body

```json
{
  "id": "PMT-090",
  "title": "Review legacy data mapping docs",
  "projectId": "954",
  "sprintId": "SPR-002",
  "assignee": "user-id-abc123",
  "priority": "High",
  "status": "new",
  "category": "Data Migration",
  "dueDate": "2024-02-15",
  "duration": "Just now",
  "createdAt": "2026-08-11T07:00:00Z"
}
```

---

## 7. TaskFormData Interface

This is the payload emitted by the `(submit)` output. The parent component maps this to
the `CreateTaskRequest` before sending to the backend.

```typescript
// Exported from create-task-modal.component.ts
export interface TaskFormData {
  title: string;                         // Required — task title
  projectId: string;                     // Project the task belongs to
  assignee: string;                      // User ID (after integration) or empty string
  priority: 'High' | 'Medium' | 'Low';  // Task urgency
  dueDate: string;                       // ISO date string or empty string
  description: string;                   // Optional notes / acceptance criteria
  sprintId?: string;                     // Sprint ID or undefined (Backlog)
}
```

> **Post-integration change:** Once the backend is connected, rename `assignee` from a
> name string to a user ID string and update the `<select>` binding accordingly.
> Consider creating a separate `assigneeName` field for display if needed.

---

## 8. Two Usage Modes

### Mode A — Context-Aware (inside Project Detail page)

```html
<!-- project-detail.page.html -->
<create-task-modal
  [isOpen]="isTaskModalOpen"
  [projectId]="project()!.id"
  [projectName]="project()!.name"
  (close)="closeTaskModal()"
  (submit)="onCreateTask($event)"
/>
```

- The **Project** field shows a read-only display of `projectName`.
- Sprints are loaded automatically for `projectId` on open.
- `onCreateTask($event)` in the parent calls `TaskService.createTask()`.

### Mode B — Global / Standalone (without project context)

```html
<!-- e.g. in a global task creation trigger -->
<create-task-modal
  [isOpen]="isGlobalTaskModalOpen"
  (close)="closeGlobalModal()"
  (submit)="onCreateTaskGlobal($event)"
/>
```

- The **Project** field becomes a `<select>` dropdown loaded from `GET /api/projects`.
- Selecting a project triggers `onProjectSelect()` which loads sprints for that project.
- `projectId` and `projectName` resolve from the user's selection inside the component.

---

## 9. Validation Rules

| Rule | Current Behaviour | Recommended After Integration |
|------|-------------------|-------------------------------|
| Task Title required | `alert()` shown if empty | Inline form validation with error message below the field |
| Project required (global mode) | `alert()` shown if empty | Inline error; disable submit button until a project is selected |
| Backend errors | Not handled — mock never fails | Show a toast or inline message; keep modal open on failure |
| Stale sprint list | Not applicable (mock) | Refresh sprints on each open or on project change |

---

## 10. Future Enhancements

The following features are planned or recommended for future development:

### 🔲 Category Selection
- The `category` field is currently hard-coded to `'Development'` in the service.
- Add a `<select>` or tag-based picker to let users choose a category per task.
- Categories should ideally be configurable per project (fetched from the backend).

### 🔲 Subtask / Parent Task Linking
- Allow a task to be created as a **child of an existing task**.
- Add an optional "Parent Task" search field that queries `GET /api/projects/:id/tasks`.
- Backend needs a `parentId` field on the `Task` model.

### 🔲 File Attachments
- Add a file upload section to attach documents, screenshots, or specs at task creation.
- Use a multipart form upload: `POST /api/tasks/:id/attachments`.

### 🔲 Estimated Story Points / Effort
- Add a numeric input for story points or time estimate (e.g., hours).
- Useful for sprint capacity planning and velocity tracking.

### 🔲 Task Labels / Tags
- Allow users to apply colour-coded labels (e.g., `bug`, `enhancement`, `blocked`).
- Labels should be project-level and fetched from `GET /api/projects/:id/labels`.

### 🔲 Reactive Form Migration
- Replace `FormsModule` (template-driven) with `ReactiveFormsModule` (`FormGroup` / `FormControl`).
- Enables proper typed validation, async validators (e.g., check title uniqueness), and
  easier unit testing.

### 🔲 Inline Validation & Accessibility
- Replace all `alert()` calls with inline error messages rendered below the relevant field.
- Add `aria-describedby` / `aria-invalid` attributes to form controls for screen reader support.
- Disable the "Create task" button while a submission is in flight (`isSubmitting` signal).

### 🔲 Draft Persistence
- Auto-save form state to `sessionStorage` so a partially filled form survives an
  accidental close or browser refresh.
- Clear the draft on successful submission.

### 🔲 Quick-Add from Kanban
- Allow a compact "quick add" variant of this modal that pre-sets the status column
  (e.g., clicking `+` in the "TO DO" column pre-selects `status = 'todo'`).
- The current modal always creates tasks with `status = 'new'`.

---

*Last updated: 2026-08-11 | Component: `CreateTaskModalComponent` | Module: `features/projects`*
