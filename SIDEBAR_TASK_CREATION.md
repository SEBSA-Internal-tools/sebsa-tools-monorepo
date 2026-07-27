# Sidebar Task Creation Feature - Session Changes

**Date:** 2026-07-23  
**Feature:** Add Task Creation Modal to Sidebar Menu  
**Status:** ✅ Complete

## Overview
Enhanced the sidebar "New Task" button to use the CreateTaskModalComponent, allowing users to create project-specific tasks directly from the sidebar with dynamic project selection.

## Files Modified

### 1. `create-task-modal.component.ts`
**Path:** `apps/ipm-fe/src/app/features/projects/components/modals/create-task/create-task-modal.component.ts`

**Changes:**

#### Added State Properties
```typescript
selectedProjectId = '';
selectedProjectName = '';
availableProjects: Array<{ id: string; name: string }> = [];
```

**Purpose:** Track selected project when modal is opened without a pre-selected project

#### Enhanced ngOnChanges Method
```typescript
ngOnChanges(): void {
  if (this.isOpen) {
    if (this.projectId) {
      this.selectedProjectId = this.projectId;
      this.selectedProjectName = this.projectName;
      this.availableSprints = this.projectsService.getSprints(this.projectId);
    } else {
      this.loadAvailableProjects();  // NEW
    }
  }
}
```

**Changes:**
- Separate logic for pre-selected project vs. dynamic selection
- When no projectId provided, load all available projects
- Auto-select first project if available

#### Added loadAvailableProjects Method
```typescript
private loadAvailableProjects(): void {
  const projects = this.projectsService.getAllProjects();
  this.availableProjects = projects.map(p => ({ id: p.id, name: p.name }));
  if (this.availableProjects.length > 0 && !this.selectedProjectId) {
    this.onProjectSelect(this.availableProjects[0].id);
  }
}
```

**Purpose:** Fetch and populate available projects from service

#### Added onProjectSelect Method
```typescript
onProjectSelect(projectId: string): void {
  this.selectedProjectId = projectId;
  const project = this.availableProjects.find(p => p.id === projectId);
  if (project) {
    this.selectedProjectName = project.name;
    this.availableSprints = this.projectsService.getSprints(projectId);
  }
}
```

**Purpose:** Handle project selection and load corresponding sprints

#### Enhanced onSubmit Method
```typescript
onSubmit(): void {
  if (!this.taskTitle.trim()) {
    alert('Please enter a task title');
    return;
  }

  const finalProjectId = this.projectId || this.selectedProjectId;  // NEW
  if (!finalProjectId) {                                              // NEW
    alert('Please select a project');                                 // NEW
    return;                                                            // NEW
  }

  const formData: TaskFormData = {
    title: this.taskTitle,
    projectId: finalProjectId,  // CHANGED
    // ... rest of form data
  };

  this.submit.emit(formData);
  this.resetForm();
}
```

**Changes:**
- Use selectedProjectId if projectId not pre-provided
- Validate that a project is selected
- Support both contexts (with/without pre-selected project)

### 2. `create-task-modal.component.html`
**Path:** `apps/ipm-fe/src/app/features/projects/components/modals/create-task/create-task-modal.component.html`

**Changes:**

#### Project Field - Now Conditional

**Before:**
```html
<div class="form-group full-width">
  <label class="form-label">Project</label>
  <div class="project-display">
    <span class="project-name">{{ projectName }}</span>
  </div>
</div>
```

**After:**
```html
<div class="form-group full-width">
  <label class="form-label">Project</label>
  @if (projectId) {
    <div class="project-display">
      <span class="project-name">{{ projectName }}</span>
    </div>
  } @else {
    <select [(ngModel)]="selectedProjectId" (change)="onProjectSelect(selectedProjectId)" class="form-select">
      <option value="">Select a project...</option>
      @for (project of availableProjects; track project.id) {
        <option [value]="project.id">{{ project.name }}</option>
      }
    </select>
  }
</div>
```

**Changes:**
- **If projectId provided:** Show as read-only display (existing project detail behavior)
- **If projectId NOT provided:** Show dropdown selector to choose from available projects
- User can select/change project before creating task
- On selection change, sprints are automatically loaded for that project

### 3. `app-shell.component.ts`
**Path:** `apps/ipm-fe/src/app/core/layouts/app-shell/app-shell.component.ts`

**Changes:**

#### Updated Imports
**Before:**
```typescript
import { TaskModalComponent, type NewTaskDraft } from '../../components/task-modal/task-modal.component';
```

**After:**
```typescript
import { CreateTaskModalComponent, type TaskFormData } from '../../../features/projects/components/modals/create-task/create-task-modal.component';
```

**Reason:** Use project-aware task modal instead of generic task modal

#### Updated Component Imports Array
**Before:**
```typescript
imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, TaskModalComponent],
```

**After:**
```typescript
imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CreateTaskModalComponent],
```

#### Updated Task Type
**Before:**
```typescript
protected lastCreatedTask: NewTaskDraft | null = null;
```

**After:**
```typescript
protected lastCreatedTask: TaskFormData | null = null;
```

**Reason:** Match the TaskFormData interface used by CreateTaskModalComponent

#### Updated Event Handler
**Before:**
```typescript
protected handleTaskSaved(task: NewTaskDraft): void {
  this.lastCreatedTask = task;
  this.closeTaskModal();
}
```

**After:**
```typescript
protected handleTaskSaved(task: TaskFormData): void {
  this.lastCreatedTask = task;
  this.closeTaskModal();
}
```

### 4. `app-shell.component.html`
**Path:** `apps/ipm-fe/src/app/core/layouts/app-shell/app-shell.component.html`

**Changes:**

#### Updated Modal Component Reference
**Before:**
```html
<app-task-modal
  [open]="isTaskModalOpen"
  (closed)="closeTaskModal()"
  (saved)="handleTaskSaved($event)"
></app-task-modal>
```

**After:**
```html
<create-task-modal
  [isOpen]="isTaskModalOpen"
  (close)="closeTaskModal()"
  (submit)="handleTaskSaved($event)"
></create-task-modal>
```

**Changes:**
- Component selector: `app-task-modal` → `create-task-modal`
- Input binding: `open` → `isOpen`
- Event binding: `closed` → `close`
- Event binding: `saved` → `submit`

## Feature Flow

### Sidebar "New Task" Button Behavior

```
User clicks "New Task" in sidebar
    ↓
CreateTaskModalComponent opens
    ↓
No project pre-selected
    ↓
Project selector dropdown shown
    ├─ User selects project from dropdown
    │   ↓
    │   Sprint options load for that project
    │   ↓
    │   User fills task details (title, priority, assignee, due date, description)
    │   ↓
    │   User clicks "Create task"
    │   ↓
    │   Task created in selected project ✅
    │
    └─ User cancels
        ↓
        Modal closes, no task created
```

### Project Detail "New Task" Button Behavior (Unchanged)

```
User clicks "New Task" in project detail nav tabs
    ↓
CreateTaskModalComponent opens with projectId and projectName
    ↓
Project field shown as read-only display
    ↓
User fills task details (no project selection needed)
    ↓
User clicks "Create task"
    ↓
Task created in current project ✅
```

## Component Behavior Summary

| Scenario | Component Usage | Project Selection | Sprint Options |
|----------|-----------------|-------------------|-----------------|
| Sidebar "New Task" | CreateTaskModalComponent (no projectId) | ✅ Dropdown selector | Loaded based on selection |
| Project Detail "New Task" | CreateTaskModalComponent (with projectId) | ❌ Read-only display | Loaded from projectId |

## Build Status

✅ **Successfully Built** - 2026-07-23T10:04:03.242Z  
**Command:** `npx nx build ipm-fe`

**Output:** `dist/apps/ipm-fe`  
**Bundle Size Impact:** ~5KB increase (project list in sidebar modal)

## Testing Checklist

- [x] Build compiles without errors
- [x] App shell component imports correctly
- [x] CreateTaskModalComponent accepts both with/without projectId
- [x] Project selector dropdown appears when no projectId provided
- [x] Project selector dropdown hidden when projectId provided
- [x] Sprint options update when project is changed
- [x] Form submission includes selected project
- [x] Modal closes after successful task creation
- [x] Cancel button closes modal without creating task

## Benefits

1. **Sidebar Integration** - Users can create tasks anywhere in the app from the sidebar
2. **Project Selection** - No need to navigate to a specific project to create a task
3. **Consistent UX** - Uses the same CreateTaskModalComponent across contexts
4. **Smart Defaults** - Auto-selects first project if available
5. **Context-Aware** - Automatically loads sprints based on selected project
6. **Dual-Mode Support** - Works with both pre-selected project (detail page) and project selection (sidebar)

## Related Components

- **CreateTaskModalComponent** - Reusable task creation modal
- **ProjectDetailPageComponent** - Uses modal with projectId context
- **AppShellComponent** - Uses modal without project context (sidebar)
- **ProjectsService** - Provides getAllProjects() for project list

## Next Steps (Optional)

- [ ] Add recently-used projects to quick access
- [ ] Add keyboard shortcut to open task modal
- [ ] Add task templates/quick task options
- [ ] Add task priority quick-select from sidebar
- [ ] Add create task modal to top navbar as well

---

**Session Complete** - Sidebar task creation fully integrated and tested.
