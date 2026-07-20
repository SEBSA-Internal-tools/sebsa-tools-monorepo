# Projects Feature — Business Analysis Documentation

> **Application:** SEBSA Project Management Tool (`ipm-fe`)
> **Feature Module:** `features/projects`
> **Technology:** Angular (Standalone Components, OnPush Change Detection)
> **Document Type:** Business Analyst Reference
> **Date:** 2026-07-20

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Feature Overview](#2-feature-overview)
3. [Architecture & Component Map](#3-architecture--component-map)
4. [Pages](#4-pages)
   - 4.1 [Projects List Page](#41-projects-list-page)
   - 4.2 [Project Detail Page](#42-project-detail-page)
5. [Components](#5-components)
   - 5.1 [Projects Hero](#51-projects-hero-component)
   - 5.2 [Projects List](#52-projects-list-component)
   - 5.3 [Project Detail Header](#53-project-detail-header-component)
   - 5.4 [Project Navigation Tabs](#54-project-navigation-tabs-component)
   - 5.5 [Project Kanban Board](#55-project-kanban-board-component)
   - 5.6 [Project Task List](#56-project-task-list-component)
6. [Modals / Dialogs](#6-modals--dialogs)
   - 6.1 [Create Project Modal](#61-create-project-modal)
   - 6.2 [Create Task Modal](#62-create-task-modal)
7. [Data Service & Domain Model](#7-data-service--domain-model)
8. [User Flows](#8-user-flows)
9. [Business Rules & Constraints](#9-business-rules--constraints)
10. [Data Model Reference](#10-data-model-reference)
11. [Future / Placeholder Views](#11-future--placeholder-views)
12. [Glossary](#12-glossary)

---

## 1. Executive Summary

The **Projects** feature is the core workspace of the SEBSA IPM (Implementation Project Management) Tool. It provides project managers and consultants with a centralised hub to:

- **Browse and manage** the organisation's full project portfolio.
- **Drill into any project** to view and track individual tasks.
- **Create new projects** with team member assignments.
- **Create and manage tasks** using both a visual Kanban board and a sortable list view.

The module is designed around two primary pages — a **Portfolio Overview** (Projects List) and a **Project Workspace** (Project Detail) — each supported by reusable components and modal dialogs.

---

## 2. Feature Overview

| Attribute            | Value                                                      |
|----------------------|------------------------------------------------------------|
| **Module Path**      | `features/projects`                                        |
| **Route (List)**     | `/projects`                                                |
| **Route (Detail)**   | `/projects/:id`                                            |
| **Primary Users**    | Project Managers, ERP Consultants, Team Members            |
| **Key Operations**   | Create Project, Browse Projects, Search/Filter, View Tasks, Create Task, Move Task (Kanban) |
| **Access Control**   | Not yet implemented (visibility flags present in data model) |

---

## 3. Architecture & Component Map

```
features/projects/
├── pages/
│   ├── projects-list/                    # Route: /projects
│   │   ├── projects-list.page.ts         # Page orchestrator
│   │   └── components/
│   │       ├── hero/                     # Banner / summary stats
│   │       └── list/                     # Searchable, filterable project table
│   │
│   └── project-detail/                   # Route: /projects/:id
│       ├── project-detail.page.ts        # Page orchestrator
│       └── components/
│           ├── header/                   # Project title, owner, status badge
│           ├── nav-tabs/                 # Tab switcher + "New task" CTA
│           ├── kanban/                   # Drag-and-drop Kanban board
│           └── task-list/               # Sortable tabular task list
│
├── components/
│   └── modals/
│       ├── create-project/              # Dialog: create new project
│       └── create-task/                 # Dialog: create new task
│
└── services/
    └── projects.service.ts              # State, CRUD, domain model
```

---

## 4. Pages

### 4.1 Projects List Page

**File:** `pages/projects-list/projects-list.page.ts`

#### Purpose
Acts as the **portfolio-level landing page** for all projects. It stitches together the hero banner, the project table, and the Create Project modal into a unified workspace view.

#### Responsibilities

| Responsibility               | Implementation Detail                                        |
|------------------------------|--------------------------------------------------------------|
| Load all projects             | Subscribes to `ProjectsService.getProjects()` as an Observable |
| Provide hero summary data    | Fetches static data via `ProjectsService.getHeroData()`     |
| Open/Close Create modal      | Manages `isModalOpen` boolean state flag                    |
| Handle project creation      | Calls `ProjectsService.addProject()` with form data         |
| Handle project search        | Delegates to `ProjectsService.searchProjects(query)`        |
| Handle project deletion      | Calls `ProjectsService.deleteProject(id)` and refreshes     |

#### Child Components Used

| Component Selector        | Purpose                                    |
|---------------------------|--------------------------------------------|
| `<projects-hero>`         | Renders the introductory banner            |
| `<projects-list>`         | Renders the searchable project table       |
| `<create-project-modal>`  | Renders the project creation dialog        |

#### Events Handled

| Event                           | Source Component         | Action Taken                               |
|---------------------------------|--------------------------|--------------------------------------------|
| `(newProjectClick)`             | `<projects-list>`        | Opens the Create Project modal             |
| `(searchChange)`                | `<projects-list>`        | Queries service for matching projects      |
| `(deleteProject)`               | `<projects-list>`        | Deletes the project and refreshes the list |
| `(close)`                       | `<create-project-modal>` | Closes modal without saving                |
| `(submit)`                      | `<create-project-modal>` | Creates project and closes modal           |

#### Page Layout

```
┌──────────────────────────────────────────────┐
│  <section class="workspace-page">            │
│  ┌────────────────────────────────────────┐  │
│  │  <projects-hero>                       │  │
│  │  Welcome banner + description          │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  <projects-list>                       │  │
│  │  Search bar + Status filters + Table   │  │
│  └────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────┐  │
│  │  <create-project-modal> (conditional)  │  │
│  └────────────────────────────────────────┘  │
└──────────────────────────────────────────────┘
```

---

### 4.2 Project Detail Page

**File:** `pages/project-detail/project-detail.page.ts`

#### Purpose
Serves as the **project workspace** — a dedicated environment for a single project. Users can view project metadata, switch between multiple content views (Kanban, Task List, etc.), and create new tasks.

#### Responsibilities

| Responsibility              | Implementation Detail                                           |
|-----------------------------|------------------------------------------------------------------|
| Load project by route param | Reads `:id` from `ActivatedRoute`, looks up project in service  |
| Guard missing project       | Redirects to `/projects` if project ID is not found            |
| Manage active view tab      | Tracks `activeTab` state: `'overview' \| 'kanban' \| 'tasklist' \| 'calendar' \| 'sprint'` |
| Open/Close Task modal       | Manages `isTaskModalOpen` boolean flag                          |
| Handle task creation        | Delegates to `ProjectsService.createTask(formData)`            |
| Navigate back               | Uses `Router.navigate(['/projects'])`                          |

#### Child Components Used

| Component Selector        | Purpose                                              |
|---------------------------|------------------------------------------------------|
| `<project-detail-header>` | Shows project name, owner, status badge, back button |
| `<project-nav-tabs>`      | Tab navigation + "New task" button                   |
| `<project-kanban>`        | Drag-and-drop Kanban board (active when `tab = 'kanban'`) |
| `<project-task-list>`     | Tabular task view (active when `tab = 'tasklist'`)   |
| `<create-task-modal>`     | Task creation dialog                                 |

#### Tab Switching Logic

| Tab ID       | Label          | Renders                         | Status         |
|--------------|----------------|---------------------------------|----------------|
| `kanban`     | Kanban Board   | `<project-kanban>`              | ✅ Implemented |
| `tasklist`   | Task List      | `<project-task-list>`           | ✅ Implemented |
| `overview`   | Overview       | Placeholder message             | 🔲 Planned     |
| `calendar`   | Calendar       | Placeholder message             | 🔲 Planned     |
| `sprint`     | Sprint         | Placeholder message             | 🔲 Planned     |

#### Page Layout

```
┌──────────────────────────────────────────────┐
│  <project-detail-header>                     │
│  [← Back]  [Avatar] Project Name   [Status] │
├──────────────────────────────────────────────┤
│  <project-nav-tabs>                          │
│  Overview | Kanban | Task List | Cal | Sprint │
│                                  [+ New task]│
├──────────────────────────────────────────────┤
│  <div class="detail-content">                │
│  ┌────────────────────────────────────────┐  │
│  │  Active Tab Content (conditional)      │  │
│  │  e.g. <project-kanban> or             │  │
│  │       <project-task-list>             │  │
│  └────────────────────────────────────────┘  │
├──────────────────────────────────────────────┤
│  <create-task-modal> (conditional)           │
└──────────────────────────────────────────────┘
```

---

## 5. Components

### 5.1 Projects Hero Component

**File:** `pages/projects-list/components/hero/projects-hero.component.ts`

#### Purpose
A **presentational banner** displayed at the top of the Projects List page, welcoming users and providing a brief description of the workspace.

#### Inputs

| Input  | Type                       | Required | Description                       |
|--------|----------------------------|----------|-----------------------------------|
| `data` | `ProjectsHeroData \| null` | Yes      | Title, description, and CTA label |

#### Displayed Data (from `ProjectsHeroData`)

| Field         | Example Value                                               |
|---------------|-------------------------------------------------------------|
| `title`       | "Welcome to Projects"                                       |
| `description` | "A flexible workspace to manage your ERP implementations…" |
| `ctaLabel`    | "Learn more"                                                |

#### Business Context
This component provides **onboarding context** for new users and sets the tone for the workspace. It is purely informational and emits no events.

---

### 5.2 Projects List Component

**File:** `pages/projects-list/components/list/projects-list.component.ts`

#### Purpose
The **main data grid** for the Projects List page. Displays all projects in a tabular format and provides search, filter, and project management actions.

#### Inputs

| Input      | Type                    | Description                          |
|------------|-------------------------|--------------------------------------|
| `projects` | `ProjectItem[] \| null` | The full list of projects to display |

#### Outputs (Events Emitted)

| Output            | Payload  | Triggered When                               |
|-------------------|----------|----------------------------------------------|
| `newProjectClick` | `void`   | User clicks the **"New project"** button     |
| `searchChange`    | `string` | User types in the search input               |
| `deleteProject`   | `string` | User confirms deletion of a project (by ID)  |

#### Features

| Feature           | Behaviour                                                                  |
|-------------------|----------------------------------------------------------------------------|
| **Search**        | Filters by project name or owner name (case-insensitive, real-time)       |
| **Status Filter** | Toggle tabs: **All**, **Open** (with count badge), **Closed** (with count badge) |
| **Clear Search**  | Appears as an `×` button inside the search box when query is non-empty    |
| **Row Click**     | Navigates to `/projects/:id` (detail page) for the clicked project        |
| **Delete**        | Shows browser `confirm()` dialog before emitting the delete event         |
| **Empty State**   | Shows a friendly "No projects found" message with a folder icon           |

#### Table Columns

| Column       | Data Source          | Notes                                           |
|--------------|----------------------|-------------------------------------------------|
| Project      | `project.name`       | Includes material icon from `project.icon`      |
| Owner        | `project.owner`      | Plain text                                      |
| Status       | `project.status`     | Styled badge: green (Open) / red (Closed)       |
| Visibility   | `project.visibility` | Icon + label: 🔒 Private / 🌐 Public            |
| Last Updated | `project.lastUpdated`| Plain date string                               |
| Actions      | —                    | Delete button (🗑️); does not trigger row click  |

---

### 5.3 Project Detail Header Component

**File:** `pages/project-detail/components/header/project-detail-header.component.ts`

#### Purpose
Renders the **top header bar** of the Project Detail page, showing project identity and navigation back to the portfolio.

#### Inputs

| Input     | Type          | Required | Description            |
|-----------|---------------|----------|------------------------|
| `project` | `ProjectItem` | Yes      | The project to display |

#### Outputs

| Output      | Payload | Triggered When                |
|-------------|---------|-------------------------------|
| `backClick` | `void`  | User clicks the ← back button |

#### Displayed Information

| UI Element     | Value                                          |
|----------------|------------------------------------------------|
| Back Button    | Arrow icon → navigates to portfolio            |
| Project Avatar | First 2 initials of project name (auto-generated) |
| Project Name   | `project.name`                                 |
| Owner          | `By {project.owner}`                           |
| Status Badge   | `Open` (green) / `Closed` (red)               |

#### Business Rule
The project avatar initials are derived automatically: the first character of each word in the project name is concatenated and truncated to 2 characters.
> Example: `"Global ERP Rollout"` → `"GE"`

---

### 5.4 Project Navigation Tabs Component

**File:** `pages/project-detail/components/nav-tabs/project-nav-tabs.component.ts`

#### Purpose
Provides the **secondary navigation bar** within a project, allowing users to switch between different content views and trigger task creation.

#### Inputs

| Input       | Type      | Default    | Description                       |
|-------------|-----------|------------|-----------------------------------|
| `activeTab` | `TabType` | `'kanban'` | Currently selected tab identifier |

#### Outputs

| Output         | Payload   | Triggered When                        |
|----------------|-----------|---------------------------------------|
| `tabChange`    | `TabType` | User clicks a tab button              |
| `addTaskClick` | `void`    | User clicks the **"New task"** button |

#### Tab Definitions

| Tab ID      | Label        | Icon (Material Symbol) |
|-------------|--------------|------------------------|
| `overview`  | Overview     | `dashboard`            |
| `kanban`    | Kanban Board | `view_kanban`          |
| `tasklist`  | Task List    | `list`                 |
| `calendar`  | Calendar     | `calendar_month`       |
| `sprint`    | Sprint       | `sprint`               |

#### UI Behaviour
- The active tab has a **blue underline indicator** and blue text colour.
- The **"New task"** button (blue CTA) is always visible on the right side.
- On small screens (`< 640px`), the button label is hidden — only the `+` icon is shown.
- The tabs list is horizontally scrollable on small screens.

---

### 5.5 Project Kanban Board Component

**File:** `pages/project-detail/components/kanban/project-kanban.component.ts`

#### Purpose
Provides a **visual drag-and-drop Kanban board** for managing task workflow within a project. Each column represents a workflow stage.

#### Inputs

| Input       | Type     | Required | Description                              |
|-------------|----------|----------|------------------------------------------|
| `projectId` | `string` | Yes      | Filters tasks belonging to this project  |

#### Kanban Columns

| Column ID    | Display Label | Colour Indicator  |
|--------------|---------------|-------------------|
| `new`        | NEW           | Grey `#94a3b8`    |
| `todo`       | TO DO         | Amber `#f59e0b`   |
| `inprogress` | IN PROGRESS   | Blue `#3b82f6`    |
| `done`       | DONE          | Green `#10b981`   |

#### Drag-and-Drop Behaviour

| Action           | Outcome                                                           |
|------------------|-------------------------------------------------------------------|
| Drag start       | Sets `draggedTask` reference; applies `.dragging` CSS class       |
| Drag over column | Prevents browser default; sets `dropEffect = 'move'`             |
| Drop on column   | Moves task to new column; updates status via `ProjectsService`    |
| Drag end         | Resets `draggedTask` to `null`                                    |

#### Task Card Elements

| Element        | Source Field    | Notes                                    |
|----------------|-----------------|------------------------------------------|
| Task ID        | `task.id`       | e.g. `PMT-089`                           |
| Priority Badge | `task.priority` | `High` / `Medium` / `Low` colour coded   |
| Title          | `task.title`    | Main descriptive text                    |
| Category       | `task.category` | e.g., "Data Migration", "Infrastructure" |
| Duration       | `task.duration` | e.g., "In stage: 2d"                    |
| Assignee Avatar| `task.assignee` | 2-letter initials; hidden if unassigned  |

#### Empty State
Each column shows an inbox icon and "No tasks" text when its task list is empty.

---

### 5.6 Project Task List Component

**File:** `pages/project-detail/components/task-list/project-task-list.component.ts`

#### Purpose
Provides a **sortable tabular view** of all tasks within a project — an alternative to the Kanban board for users who prefer a list-based workflow.

#### Inputs

| Input       | Type     | Required | Description                             |
|-------------|----------|----------|-----------------------------------------|
| `projectId` | `string` | Yes      | Filters tasks belonging to this project |

#### Sort Options

| Sort Key   | Sort Behaviour                                          |
|------------|---------------------------------------------------------|
| `status`   | Orders by workflow: New → To Do → In Progress → Done   |
| `priority` | Orders by urgency: High → Medium → Low                 |
| `date`     | Orders by due date: latest first (descending)          |

#### Table Columns

| Column     | Source Field    | Display Notes                                       |
|------------|-----------------|-----------------------------------------------------|
| ID         | `task.id`       | Styled as a code tag (e.g. `PMT-089`)              |
| Task Title | `task.title`    | Plain text                                          |
| Category   | `task.category` | Styled as a badge                                   |
| Status     | `task.status`   | Human-readable label + colour badge                 |
| Priority   | `task.priority` | Colour-coded badge (`High` / `Medium` / `Low`)      |
| Duration   | `task.duration` | Plain text (e.g. "In stage: 2d")                   |
| Assignee   | `task.assignee` | 2-letter avatar initials; `—` if unassigned         |

#### Status Labels (Internal → Display)

| Internal Key | Display Label |
|--------------|---------------|
| `new`        | New           |
| `todo`       | To Do         |
| `inprogress` | In Progress   |
| `done`       | Done          |

#### Empty State
Displays a task_alt icon with "No tasks yet — Create your first task to get started."

---

## 6. Modals / Dialogs

### 6.1 Create Project Modal

**File:** `components/modals/create-project/create-project-modal.component.ts`

#### Purpose
A **full-screen modal dialog** that collects information required to create a new project in the portfolio.

#### Inputs

| Input    | Type      | Default | Description                   |
|----------|-----------|---------|-------------------------------|
| `isOpen` | `boolean` | `false` | Controls modal visibility     |

#### Outputs

| Output   | Payload           | Triggered When                               |
|----------|-------------------|----------------------------------------------|
| `close`  | `void`            | User cancels, clicks ×, or clicks backdrop   |
| `submit` | `ProjectFormData` | User clicks "Create Project" (valid)         |

#### Form Fields

| Field            | Type               | Required | Placeholder / Notes                          |
|------------------|--------------------|----------|----------------------------------------------|
| **Project Name** | Text Input         | ✅ Yes    | "e.g. Q3 Financial Audit Implementation"     |
| **Description**  | Textarea           | ❌ No     | "Briefly describe the project goals…" (4 rows) |
| **Team Members** | Search + Multi-select | ❌ No  | Search from pre-defined consultant list      |

#### Team Member Assignment Flow

```
1. User types name in search input
   └─ getFilteredMembers() filters available members
      └─ Dropdown appears with matching names

2. User clicks a member in dropdown
   └─ Member added to selectedMembers[]
   └─ Member removed from dropdown options (prevents duplicates)
   └─ Search query cleared

3. User can remove selected members via × button on their tag
```

#### Available Consultants (Pre-seeded)

| ID | Name           | Avatar Initials |
|----|----------------|-----------------|
| 1  | Sarah Miller   | SM              |
| 2  | James Chen     | JC              |
| 3  | Emma Rodriguez | ER              |
| 4  | David Kim      | DK              |
| 5  | Lisa Anderson  | LA              |
| 6  | Michael Brown  | MB              |

#### Validation Rules

| Rule                      | Message / Behaviour                          |
|---------------------------|----------------------------------------------|
| Project Name is required  | `alert('Please enter a project name')`       |
| Form resets on close/submit | All fields cleared to initial state        |
| Backdrop click = cancel   | Equivalent to clicking the "Cancel" button   |

#### Emitted `ProjectFormData` Structure

```typescript
interface ProjectFormData {
  name: string;              // Project Name
  description: string;       // Description
  teamMembers: TeamMember[]; // Array of selected members
}
```

---

### 6.2 Create Task Modal

**File:** `components/modals/create-task/create-task-modal.component.ts`

#### Purpose
A **modal dialog** for creating new tasks within a specific project. Tasks are added to the project's backlog with an initial status of `new`.

#### Inputs

| Input         | Type      | Required | Description                              |
|---------------|-----------|----------|------------------------------------------|
| `isOpen`      | `boolean` | Yes      | Controls modal visibility                |
| `projectId`   | `string`  | Yes      | Associates the task with the project     |
| `projectName` | `string`  | Yes      | Displayed in the Project field (read-only) |

#### Outputs

| Output   | Payload        | Triggered When                               |
|----------|----------------|----------------------------------------------|
| `close`  | `void`         | User cancels, clicks ×, or clicks backdrop   |
| `submit` | `TaskFormData` | User clicks "Create task" (valid)            |

#### Form Fields

| Field           | Type             | Required | Notes                                              |
|-----------------|------------------|----------|----------------------------------------------------|
| **Project**     | Read-only display | N/A     | Shows `projectName` — not editable by the user     |
| **Task Title**  | Text Input        | ✅ Yes   | Free-form description of the task                  |
| **Priority**    | Button group      | ✅ Yes   | `High` / `Med` / `Low` — default is `High`         |
| **Assignee**    | Dropdown Select   | ❌ No    | Same consultant list as Create Project modal       |
| **Due Date**    | Date Picker       | ❌ No    | Standard HTML date input                           |
| **Description** | Textarea          | ❌ No    | 6 rows; for details, acceptance criteria, or notes |

#### Default Values on Open

| Field    | Default   |
|----------|-----------|
| Priority | `High`    |
| Assignee | _(empty)_ |
| Due Date | _(empty)_ |

#### Validation Rules

| Rule                          | Behaviour                                    |
|-------------------------------|----------------------------------------------|
| Task Title is required        | `alert('Please enter a task title')`         |
| Form resets after submit/cancel | All fields return to defaults              |
| Backdrop click = cancel       | Equivalent to clicking "Cancel"              |

#### Emitted `TaskFormData` Structure

```typescript
interface TaskFormData {
  title: string;                        // Task Title
  projectId: string;                    // Bound from @Input
  assignee: string;                     // Consultant name or empty string
  priority: 'High' | 'Medium' | 'Low'; // Selected priority
  dueDate: string;                      // ISO date string or empty string
  description: string;                  // Optional description text
}
```

#### Post-Creation Defaults (set by service)

| Field      | Auto-assigned Value                                     |
|------------|---------------------------------------------------------|
| `id`       | `PMT-{padded sequence}` e.g. `PMT-006`                 |
| `status`   | `'new'`                                                 |
| `category` | `'Development'`                                         |
| `duration` | `'Just now'`                                            |

---

## 7. Data Service & Domain Model

**File:** `services/projects.service.ts`

The `ProjectsService` is a **root-level singleton** (`providedIn: 'root'`) that manages all project and task state using RxJS `BehaviorSubject`. This is the **single source of truth** for the entire Projects feature.

### State Management

| BehaviorSubject | Type            | Initial Seed Data                               |
|-----------------|-----------------|-------------------------------------------------|
| `projects$`     | `ProjectItem[]` | 3 projects (SEBSA ERP Rollout, Q4 Audit, Personal) |
| `tasks$`        | `Task[]`        | 5 tasks, all associated with project `954`       |

### Service Methods — Projects

| Method                  | Return Type                 | Description                                  |
|-------------------------|-----------------------------|----------------------------------------------|
| `getProjects()`         | `Observable<ProjectItem[]>` | All projects as a reactive stream            |
| `getOpenProjects()`     | `Observable<ProjectItem[]>` | Only projects with status `Open`             |
| `getClosedProjects()`   | `Observable<ProjectItem[]>` | Only projects with status `Closed`           |
| `getAllProjects()`       | `ProjectItem[]`             | Synchronous snapshot of all projects         |
| `addProject(project)`   | `void`                      | Adds a new project (auto-generates ID)       |
| `deleteProject(id)`     | `void`                      | Removes project by ID                        |
| `searchProjects(query)` | `Observable<ProjectItem[]>` | Filters by name or owner (case-insensitive)  |
| `getHeroData()`         | `ProjectsHeroData`          | Returns static hero banner content           |

### Service Methods — Tasks

| Method                              | Return Type | Description                                  |
|-------------------------------------|-------------|----------------------------------------------|
| `getTasks(projectId)`               | `Task[]`    | Returns synchronous tasks for a project      |
| `createTask(formData)`              | `void`      | Creates and appends a new task               |
| `updateTaskStatus(taskId, status)`  | `void`      | Updates task status (used by Kanban DnD)     |

### Seed Data — Projects

| ID    | Name                              | Owner       | Status | Visibility |
|-------|-----------------------------------|-------------|--------|------------|
| `954` | @SEBSA / Global ERP Rollout       | SEBSA       | Open   | Private    |
| `902` | @SEBSA / Q4 Financial Audit Prep  | SEBSA       | Closed | Public     |
| `1`   | @Sanjeewa001's untitled project   | Sanjeewa001 | Open   | Private    |

### Seed Data — Tasks (Project `954`)

| ID        | Title                              | Category         | Status     | Priority | Assignee      |
|-----------|------------------------------------|------------------|------------|----------|---------------|
| `PMT-089` | Review legacy data mapping docs    | Data Migration   | new        | High     | Sarah Miller  |
| `PMT-092` | Setup initial staging environment  | Infrastructure   | todo       | High     | James Chen    |
| `PMT-093` | Create migration scripts           | Development      | inprogress | Medium   | Emma Rodriguez|
| `PMT-094` | Test data migration                | Testing          | done       | High     | David Kim     |
| `PMT-095` | Document process flows             | Documentation    | new        | Low      | _(none)_      |

---

## 8. User Flows

### Flow 1: Create a New Project

```
User lands on /projects
  └─ Clicks "New project" button (in projects-list component)
       └─ Event: newProjectClick → page opens modal (isModalOpen = true)
            └─ User fills: Name* + Description + Team Members
                 └─ Clicks "Create Project"
                      └─ Validation: Name must not be empty
                           └─ [Pass] Event: submit → onCreateProject()
                                ├─ projectsService.addProject()
                                ├─ Refresh projects$ Observable
                                └─ Modal closes (isModalOpen = false)
                           └─ [Fail] alert() shown; modal stays open
```

### Flow 2: Search & Filter Projects

```
User is on /projects
  └─ Types in search box
       └─ Event: ngModelChange → onSearchChange()
            └─ Parent: onSearch(query) called
                 ├─ [Query not empty] projects$ = searchProjects(query)
                 └─ [Query empty]    projects$ = getProjects()
                      └─ projects-list re-renders filtered results

  └─ Clicks status filter tab (All / Open / Closed)
       └─ Component-level filter: selectedStatus updated
            └─ filteredProjects() computed getter re-filters instantly
```

### Flow 3: Navigate to Project Detail

```
User clicks on a project row in projects-list
  └─ onProjectClick(id, event) called
       └─ Guard: if click is within .col-actions → return (no navigation)
            └─ router.navigate(['/projects', id])
                 └─ ProjectDetailPageComponent activated
                      └─ ngOnInit() reads :id from route params
                           ├─ Project found → display detail page
                           └─ Project not found → redirect to /projects
```

### Flow 4: Create a New Task

```
User is on /projects/:id
  └─ Clicks "+ New task" button (in nav-tabs component)
       └─ Event: addTaskClick → page opens modal (isTaskModalOpen = true)
            └─ User fills: Title* + Priority + Assignee + Due Date + Description
                 └─ Clicks "Create task"
                      └─ Validation: Title must not be empty
                           └─ [Pass] Event: submit → onCreateTask(formData)
                                ├─ projectsService.createTask(formData)
                                └─ Modal closes (isTaskModalOpen = false)
                           └─ [Fail] alert() shown; modal stays open
```

### Flow 5: Move a Task via Kanban Drag-and-Drop

```
User is on /projects/:id → Kanban Board tab
  └─ Drags a task card from one column to another
       └─ dragstart → draggedTask set; .dragging class applied
            └─ dragover target column → preventDefault()
                 └─ drop on target column
                      ├─ Task removed from source column
                      ├─ task.status updated to new column ID
                      ├─ projectsService.updateTaskStatus(id, newStatus)
                      └─ Task added to target column
```

### Flow 6: Delete a Project

```
User is on /projects
  └─ Clicks 🗑️ delete button on a project row
       └─ browser confirm() dialog shown
            ├─ [Cancel] Nothing happens
            └─ [Confirm] Event: deleteProject(id) emitted
                 └─ projectsService.deleteProject(id)
                      └─ projects$ refreshed → row disappears from table
```

---

## 9. Business Rules & Constraints

| # | Rule | Detail |
|---|------|--------|
| BR-001 | **Project Name is mandatory** | Create Project modal blocks submission without a name |
| BR-002 | **Task Title is mandatory** | Create Task modal blocks submission without a title |
| BR-003 | **New tasks always start as "new"** | Status is not configurable at creation time |
| BR-004 | **New task category defaults to "Development"** | Category is not exposed in the Create Task form |
| BR-005 | **Project IDs are auto-generated** | Uses `Date.now()` as a string for new projects |
| BR-006 | **Task IDs follow the `PMT-NNN` pattern** | Auto-generated based on total task count |
| BR-007 | **Deletion requires user confirmation** | Browser `confirm()` dialog prevents accidental deletion |
| BR-008 | **Clicking a project row navigates to detail** | Except clicks within the Actions (delete) column |
| BR-009 | **Redirect on invalid project ID** | Detail page redirects to `/projects` if ID is not found |
| BR-010 | **Default active tab is Kanban** | `activeTab` defaults to `'kanban'` on page load |
| BR-011 | **Drag-and-drop only changes status if column differs** | No-op if task dropped on its own column |
| BR-012 | **Team members cannot be selected twice** | Already-selected members are excluded from the dropdown |

---

## 10. Data Model Reference

### `ProjectItem`

```typescript
interface ProjectItem {
  id: string;                        // Unique project identifier
  name: string;                      // Display name
  owner: string;                     // Project owner name
  status: 'Open' | 'Closed';        // Workflow status
  visibility: 'Private' | 'Public'; // Access control flag
  lastUpdated: string;               // Human-readable date string
  icon?: string;                     // Material symbol name (optional)
}
```

### `Task`

```typescript
interface Task {
  id: string;                                        // e.g. "PMT-089"
  title: string;                                     // Task description
  category: string;                                  // e.g. "Data Migration"
  status: 'new' | 'todo' | 'inprogress' | 'done';  // Kanban workflow status
  priority: 'High' | 'Medium' | 'Low';              // Task urgency level
  duration: string;                                  // e.g. "In stage: 2d"
  assignee?: string;                                 // Optional consultant name
  dueDate: string;                                   // ISO date string
  projectId: string;                                 // Foreign key → ProjectItem.id
}
```

### `ProjectsHeroData`

```typescript
interface ProjectsHeroData {
  title: string;       // Banner heading
  description: string; // Descriptive paragraph text
  ctaLabel: string;    // Label for call-to-action link
}
```

### `ProjectFormData` (Create Project Modal output)

```typescript
interface ProjectFormData {
  name: string;
  description: string;
  teamMembers: TeamMember[];
}

interface TeamMember {
  id: string;
  name: string;
  avatar: string; // 2-letter initials
}
```

### `TaskFormData` (Create Task Modal output)

```typescript
interface TaskFormData {
  title: string;
  projectId: string;
  assignee: string;
  priority: 'High' | 'Medium' | 'Low';
  dueDate: string;
  description: string;
}
```

---

## 11. Future / Placeholder Views

The following tabs are defined in the navigation but do not yet have content implementations:

| Tab       | Placeholder Heading | Placeholder Icon | Status     |
|-----------|---------------------|------------------|------------|
| Overview  | "Project Overview"  | `dashboard`      | 🔲 Planned |
| Calendar  | "Project Calendar"  | `calendar_month` | 🔲 Planned |
| Sprint    | "Sprint View"       | `sprint`         | 🔲 Planned |

Each placeholder currently displays: icon + heading + _"content coming soon"_ text.

**Recommended development priority (BA assessment):**

1. **Project Overview** — Summary KPIs (total tasks, completion rate, team roster, progress bar)
2. **Sprint View** — Sprint planning board with capacity, velocity, and burn-down tracking
3. **Calendar View** — Timeline/Gantt-style view mapping task due dates to a calendar grid

---

## 12. Glossary

| Term             | Definition                                                                       |
|------------------|----------------------------------------------------------------------------------|
| **Project**      | A top-level container for a consulting engagement (e.g., ERP Rollout, Audit Prep)|
| **Task**         | A discrete unit of work within a project, tracked on the Kanban board            |
| **Portfolio**    | The collection of all projects visible to the user                               |
| **Kanban Board** | A visual board with columns representing workflow stages; supports drag-and-drop |
| **PMT-NNN**      | Task ID format used by the system (Project Management Tool ticket number)        |
| **Hero**         | The top banner component providing onboarding context for the Projects workspace  |
| **OnPush**       | Angular change detection strategy — component updates only on input reference changes |
| **Standalone**   | Angular component pattern that declares its own imports without an NgModule      |
| **BehaviorSubject** | RxJS subject that holds current state and replays it to new subscribers       |
| **Visibility**   | A project attribute (`Private` / `Public`) — currently display-only              |
| **Status**       | For projects: `Open` / `Closed`. For tasks: `new`, `todo`, `inprogress`, `done` |
| **Seed Data**    | Pre-loaded demo records in the service that simulate a real backend response     |

---

*Document generated from source analysis of `apps/ipm-fe/src/app/features/projects`.*
*Last analysed: 2026-07-20*
