# Project Overview Dashboard — Redesign Specification

> **Component:** `ProjectOverviewComponent`
> **Selector:** `project-overview`
> **Location:** `pages/project-detail/components/overview/`
> **Purpose:** This document defines the complete requirements, layout, data model, and
> implementation guide for the **redesigned Project Overview Dashboard**.

---

## Table of Contents

1. [Goal & Scope](#1-goal--scope)
2. [What to Keep / Remove](#2-what-to-keep--remove)
3. [New Dashboard Layout](#3-new-dashboard-layout)
4. [Section A — Metric Summary Cards (4 KPI Cards)](#4-section-a--metric-summary-cards-4-kpi-cards)
5. [Section B — Priority Donut Chart](#5-section-b--priority-donut-chart)
6. [Section C — Four Data Tables](#6-section-c--four-data-tables)
7. [Section D — Project Info (Keep)](#7-section-d--project-info-keep)
8. [Section E — Sprint Status (Keep)](#8-section-e--sprint-status-keep)
9. [Data & Computed Fields](#9-data--computed-fields)
10. [Component Changes (TypeScript)](#10-component-changes-typescript)
11. [Design Tokens & Style Guide](#11-design-tokens--style-guide)
12. [Visual Layout Diagram](#12-visual-layout-diagram)

---

## 1. Goal & Scope

Replace the current overview dashboard (4 simple stat cards, progress bar, recent tasks list)
with a **modern, data-rich project management dashboard** that gives PMs and stakeholders
instant visibility into task health, team workload, and delivery risk — all in one view.

**Stack:** Angular Standalone Component, `ChangeDetectionStrategy.OnPush`, vanilla CSS,
SVG-based donut chart (no external chart library required).

---

## 2. What to Keep / Remove

| Section | Current HTML Comment | Action |
|---|---|---|
| Project Info card | `<!-- Section 4: Project Info -->` | ✅ **Keep** — move to bottom-left |
| Sprint Status card | inside `<!-- Section 2: Progress & Sprint Status -->` | ✅ **Keep** — move to bottom-right |
| Project Statistics (4 stat cards) | `<!-- Section 1: Project Statistics Cards -->` | ❌ **Remove** — replaced by new KPI metric cards |
| Overall Progress bar | `<!-- Overall Progress -->` | ❌ **Remove** — replaced by Project Health % KPI card |
| Recent Tasks list | `<!-- Section 3: Recent Tasks -->` | ❌ **Remove** — replaced by 4 data tables |

---

## 3. New Dashboard Layout

The new dashboard uses a **responsive CSS grid**. On wide screens (≥ 1200 px) the layout is:

```
┌─────────────────────────────────────────────────────────────────────┐
│  HEADER: "Project Overview"  ·  project.name                        │
├───────────┬───────────┬───────────┬───────────────────────────────  │
│  KPI Card │  KPI Card │  KPI Card │  KPI Card                       │
│ Total     │ Functional│ Technical │ Health %                        │
│ Tasks     │ Tasks     │ Tasks     │                                 │
├───────────────────────────────┬─────────────────────────────────────┤
│  Priority Donut Chart         │  Status × Count Table               │
│  (left-half)                  │  (right-half)                       │
├─────────────────┬─────────────┴──────────────────────────────────── │
│ Tech Assignee   │  Functional Assignee  │  Status × Aging           │
│ Count Table     │  Count Table          │  Table                    │
├─────────────────┴───────────────────────┴─────────────────────────  │
│  Project Info (keep)          │  Sprint Status (keep)               │
└───────────────────────────────┴─────────────────────────────────────┘
```

---

## 4. Section A — Metric Summary Cards (4 KPI Cards)

### Layout
Four cards rendered in a single horizontal row using CSS Grid (`grid-template-columns: repeat(4, 1fr)`).
Each card uses a **glassmorphism / frosted surface** style with a coloured left-border accent
and a large bold metric number.

### Cards Specification

| # | Title | Metric | Icon | Accent Colour |
|---|---|---|---|---|
| 1 | **Total Tasks** | `allTasks.length` | `task_alt` | `#6366f1` (indigo) |
| 2 | **Functional Tasks** | tasks where `type === 'FUNCTIONAL'` count | `category` | `#0ea5e9` (sky blue) |
| 3 | **Technical Tasks** | tasks where `type === 'TECHNICAL'` count | `engineering` | `#f59e0b` (amber) |
| 4 | **Project Health** | computed percentage (see formula below) | `favorite` | dynamic (green / amber / red) |

### Project Health Formula

```
health = ((weightCompleted × done) + (weightInProgress × inProgress)) / total × 100

where:
  weightCompleted  = 1.0
  weightInProgress = 0.4
  total            = allTasks.length (if 0, return 100)
```

**Health colour thresholds:**

| Range | Colour | Label |
|---|---|---|
| ≥ 75 % | `#10b981` (green) | Healthy |
| 40 – 74 % | `#f59e0b` (amber) | At Risk |
| < 40 % | `#ef4444` (red) | Critical |

### Card Anatomy (HTML structure per card)

```html
<div class="kpi-card" [style.--accent]="card.accent">
  <div class="kpi-icon-wrap">
    <span class="material-symbols-outlined">{{ card.icon }}</span>
  </div>
  <div class="kpi-body">
    <span class="kpi-value">{{ card.value }}</span>
    <span class="kpi-label">{{ card.title }}</span>
    <!-- Health card only: coloured pill badge -->
    @if (card.id === 'health') {
      <span class="kpi-health-badge" [class]="healthClass()">{{ healthLabel() }}</span>
    }
  </div>
  <!-- Subtle sparkline / decorative arc — optional -->
</div>
```

### TypeScript — Signal Definitions

```typescript
// Add to ProjectOverviewComponent
interface OverviewMetrics {
  totalTasks: number;
  functionalTasks: number;
  technicalTasks: number;
  healthPct: number;
  healthLabel: 'Healthy' | 'At Risk' | 'Critical';
}

readonly metrics = signal<OverviewMetrics>({
  totalTasks: 0,
  functionalTasks: 0,
  technicalTasks: 0,
  healthPct: 0,
  healthLabel: 'Healthy',
});

// Computed helper
computeMetrics(tasks: TaskView[]): OverviewMetrics {
  const total        = tasks.length;
  const functional   = tasks.filter(t => t.type === 'FUNCTIONAL').length;
  const technical    = tasks.filter(t => t.type === 'TECHNICAL').length;
  const done         = tasks.filter(t => t.statusLabel === 'done').length;
  const inProgress   = tasks.filter(t => t.statusLabel === 'inprogress').length;

  const rawHealth    = total === 0 ? 100 : ((done * 1.0 + inProgress * 0.4) / total) * 100;
  const healthPct    = Math.min(100, Math.round(rawHealth));
  const healthLabel  = healthPct >= 75 ? 'Healthy' : healthPct >= 40 ? 'At Risk' : 'Critical';

  return { totalTasks: total, functionalTasks: functional, technicalTasks: technical, healthPct, healthLabel };
}
```

---

## 5. Section B — Priority Donut Chart

### Overview
A pure **SVG donut chart** (no third-party library) rendered inline in the template.
It shows the distribution of tasks by priority: **HIGH**, **MEDIUM**, **LOW**, and
optionally **NONE / UNSET**.

### Interaction — Click to Reveal Count
- Each donut segment is a `<path>` element wrapped in a `<g>` with `(click)` handler.
- Clicking a segment sets an `activePrioritySegment` signal with the priority key.
- The **centre of the donut** displays the selected segment's label and count
  (e.g., "HIGH — 12"). When nothing is selected, show total task count.
- A subtle `scale(1.04)` CSS transform on the active segment provides hover/click feedback.

### Donut Colour — Fallback Palette (Dynamic)

> ⚠️ **Priority values are dynamic.** The segment list is built entirely from whatever
> `priority` values actually exist in the current task set. Do **not** hardcode a fixed
> list of priority names — new priority values added in the backend will appear
> automatically without any frontend changes.

A **colour map** provides a sensible default colour for known priorities and a
generic fallback for any unknown values:

```typescript
// Fallback colour map — extend as the backend adds new priority values
const PRIORITY_COLORS: Record<string, string> = {
  HIGH:   '#ef4444',
  MEDIUM: '#f59e0b',
  LOW:    '#3b82f6',
  NONE:   '#d1d5db',
};

// Generic colour palette for unknown priorities (cycle through these)
const FALLBACK_COLORS = ['#8b5cf6', '#06b6d4', '#10b981', '#f97316', '#ec4899'];

function getPriorityColor(priority: string, index: number): string {
  return PRIORITY_COLORS[priority] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}
```

### SVG Construction — Dynamic Stroke-Dasharray

```typescript
// Computed SVG segments from priority counts
interface DonutSegment {
  priority: string;
  count: number;
  color: string;
  dasharray: string;   // "arcLength gapLength"
  dashoffset: number;  // rotation offset
}

computeDonutSegments(tasks: TaskView[]): DonutSegment[] {
  const RADIUS = 70;
  const CIRC   = 2 * Math.PI * RADIUS;  // circumference ≈ 439.8
  const total  = tasks.length || 1;

  // --- DYNAMIC: extract all distinct priority values from actual task data ---
  const priorityCounts = new Map<string, number>();
  tasks.forEach(t => {
    const key = t.priority ?? 'NONE';
    priorityCounts.set(key, (priorityCounts.get(key) ?? 0) + 1);
  });

  // Sort descending by count so the largest segment starts at the top
  const sorted = [...priorityCounts.entries()]
    .sort((a, b) => b[1] - a[1]);

  let offset = 0;
  return sorted.map(([priority, count], idx) => {
    const arc = (count / total) * CIRC;
    const seg: DonutSegment = {
      priority,
      count,
      color: getPriorityColor(priority, idx),
      dasharray: `${arc} ${CIRC - arc}`,
      dashoffset: -offset,
    };
    offset += arc;
    return seg;
  });
}
```

### HTML Template

```html
<!-- Priority Donut Chart Card -->
<div class="chart-card">
  <div class="card-header">
    <h3>Tasks by Priority</h3>
  </div>

  <div class="donut-layout">
    <!-- SVG Donut -->
    <svg viewBox="0 0 180 180" class="donut-svg">
      <g transform="rotate(-90 90 90)">
        @for (seg of donutSegments(); track seg.priority) {
          <circle
            cx="90" cy="90" r="70"
            fill="none"
            [attr.stroke]="seg.color"
            stroke-width="28"
            [attr.stroke-dasharray]="seg.dasharray"
            [attr.stroke-dashoffset]="seg.dashoffset"
            class="donut-segment"
            [class.active]="activePriority() === seg.priority"
            (click)="onSegmentClick(seg.priority)"
          />
        }
      </g>
      <!-- Centre label -->
      <text x="90" y="85" class="donut-center-value">
        {{ activePriority() ? getPriorityCount(activePriority()!) : metrics().totalTasks }}
      </text>
      <text x="90" y="105" class="donut-center-label">
        {{ activePriority() ?? 'Total' }}
      </text>
    </svg>

    <!-- Legend -->
    <div class="donut-legend">
      @for (seg of donutSegments(); track seg.priority) {
        <div class="legend-item" (click)="onSegmentClick(seg.priority)"
             [class.active]="activePriority() === seg.priority">
          <span class="legend-dot" [style.background]="seg.color"></span>
          <span class="legend-label">{{ seg.priority }}</span>
          <span class="legend-count">{{ seg.count }}</span>
        </div>
      }
    </div>
  </div>
</div>
```

### TypeScript Signals

```typescript
readonly donutSegments   = signal<DonutSegment[]>([]);
readonly activePriority  = signal<string | null>(null);

onSegmentClick(priority: string): void {
  // Toggle off if already selected
  this.activePriority.update(p => p === priority ? null : priority);
}

getPriorityCount(priority: string): number {
  return this.donutSegments().find(s => s.priority === priority)?.count ?? 0;
}
```

---

## 6. Section C — Four Data Tables

All four tables share the same **compact table style** — subtle header row, striped rows,
sticky header, sortable columns (click header to toggle asc/desc).

### Table 1 — Status × Total Count

| Column | Source Field | Notes |
|---|---|---|
| Status | `task.statusLabel` | Display as pill badge |
| Count | grouped count | Number of tasks in each status |
| % of Total | `count / total × 100` | Progress mini-bar |

> ⚠️ **Status values are dynamic.** The table rows are derived entirely from whatever
> `statusLabel` values exist in the current task data. Do **not** hardcode a fixed
> status list — new workflow stages added in the backend will appear automatically.

```typescript
interface StatusRow { status: string; count: number; pct: number; }

computeStatusTable(tasks: TaskView[]): StatusRow[] {
  const total = tasks.length;

  // --- DYNAMIC: group by whatever statusLabel values exist in the data ---
  const statusCounts = new Map<string, number>();
  tasks.forEach(t => {
    const key = t.statusLabel ?? 'unknown';
    statusCounts.set(key, (statusCounts.get(key) ?? 0) + 1);
  });

  // Sort descending by count
  return [...statusCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      pct: total ? Math.round((count / total) * 100) : 0,
    }));
}
```

---

### Table 2 — Technical Assignees × Task Count

Shows only tasks where `type === 'TECHNICAL'`, grouped by assignee.

| Column | Source Field |
|---|---|
| Assignee | `task.assignee` (display name) |
| Task Count | count of tasks for that assignee |
| In Progress | tasks with `statusLabel === 'inprogress'` |
| Done | tasks with `statusLabel === 'done'` |

```typescript
interface AssigneeRow { name: string; total: number; inProgress: number; done: number; }

computeTechnicalAssignees(tasks: TaskView[]): AssigneeRow[] {
  const technical = tasks.filter(t => t.type === 'TECHNICAL');
  const map = new Map<string, TaskView[]>();
  technical.forEach(t => {
    const key = t.assignee ?? 'Unassigned';
    map.set(key, [...(map.get(key) ?? []), t]);
  });
  return [...map.entries()]
    .map(([name, ts]) => ({
      name,
      total: ts.length,
      inProgress: ts.filter(t => t.statusLabel === 'inprogress').length,
      done: ts.filter(t => t.statusLabel === 'done').length,
    }))
    .sort((a, b) => b.total - a.total);
}
```

---

### Table 3 — Functional Assignees × Task Count

Same structure as Table 2 but for `type === 'FUNCTIONAL'` tasks.

| Column | Source Field |
|---|---|
| Assignee | `task.assignee` |
| Task Count | count per assignee |
| In Progress | inprogress count |
| Done | done count |

```typescript
computeFunctionalAssignees(tasks: TaskView[]): AssigneeRow[] {
  const functional = tasks.filter(t => t.type === 'FUNCTIONAL');
  // Same grouping logic as computeTechnicalAssignees
}
```

---

### Table 4 — Status × Aging (Days in Stage)

Shows for each status, the **average**, **minimum**, and **maximum** number of days
a task has been in that stage. This highlights bottlenecks where tasks are stalled.

| Column | Source | Notes |
|---|---|---|
| Status | `task.statusLabel` | Pill badge |
| Task Count | tasks in status | |
| Avg Days | mean of `daysInStage` | Highlight if > 7 days |
| Min Days | min of `daysInStage` | |
| Max Days | max of `daysInStage` | Red badge if > 14 days |

**Computing `daysInStage`:**
Use `task.updatedAt` as a proxy for "last status change date" until a real
`stageChangedAt` field is available from the backend.

> ⚠️ **Status values are dynamic.** Aging rows are built from whatever `statusLabel`
> values exist in the task data — never from a fixed list.

```typescript
interface AgingRow {
  status: string;
  count: number;
  avgDays: number;
  minDays: number;
  maxDays: number;
}

computeAgingTable(tasks: TaskView[]): AgingRow[] {
  const today = new Date();

  // --- DYNAMIC: collect all distinct status values from actual task data ---
  const statusGroups = new Map<string, TaskView[]>();
  tasks.forEach(t => {
    const key = t.statusLabel ?? 'unknown';
    statusGroups.set(key, [...(statusGroups.get(key) ?? []), t]);
  });

  return [...statusGroups.entries()]
    .map(([status, group]) => {
      const days = group.map(t => {
        const ref = t.updatedAt ? new Date(t.updatedAt) : new Date(t.dueDate ?? today);
        return Math.max(0, Math.floor((today.getTime() - ref.getTime()) / 86_400_000));
      });
      return {
        status,
        count: group.length,
        avgDays: days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0,
        minDays: days.length ? Math.min(...days) : 0,
        maxDays: days.length ? Math.max(...days) : 0,
      };
    })
    // Sort by avgDays descending — most stalled stages at the top
    .sort((a, b) => b.avgDays - a.avgDays);
}
```

---

## 7. Section D — Project Info (Keep)

Retain the existing `<!-- Section 4: Project Info -->` block **without changes** to its
data bindings. Move it to the **bottom-left** of the new grid layout.

Existing bindings to preserve:
- `project.createdBy.name`
- `statusLabel()` / `statusClass()`
- `project.type | titlecase`
- `project.updatedAt | date: 'mediumDate'`
- `project.customer.name`

---

## 8. Section E — Sprint Status (Keep)

Retain the existing sprint status block from `<!-- Sprint Status -->` **without changes**.
Move it to the **bottom-right** of the new grid. Preserve all existing bindings:
- `sprintStats().active` / `.planned` / `.completed`
- `activeSprint()!.name`
- `activeSprint()!.startDate` / `.endDate`

---

## 9. Data & Computed Fields

### New Signals to Add

```typescript
readonly metrics        = signal<OverviewMetrics>({ ... });       // 4 KPI cards
readonly donutSegments  = signal<DonutSegment[]>([]);              // donut chart
readonly activePriority = signal<string | null>(null);             // donut click state
readonly statusTable    = signal<StatusRow[]>([]);                 // Table 1
readonly techAssignees  = signal<AssigneeRow[]>([]);               // Table 2
readonly funcAssignees  = signal<AssigneeRow[]>([]);               // Table 3
readonly agingTable     = signal<AgingRow[]>([]);                  // Table 4
```

### Update `loadProjectData()` to Populate All Signals

```typescript
private loadProjectData(): void {
  if (!this.project.id) return;

  const tasks   = this.tasksService.getTasksByProject(this.project.id);
  const sprints = this.projectsService.getSprints(this.project.id);

  // Keep existing sprint signals
  this.sprintStats.set({ ... });
  this.activeSprint.set(sprints.find(s => s.status === 'active') ?? null);
  this.allSprints.set(sprints);

  // NEW — populate dashboard signals
  this.metrics.set(this.computeMetrics(tasks));
  this.donutSegments.set(this.computeDonutSegments(tasks));
  this.statusTable.set(this.computeStatusTable(tasks));
  this.techAssignees.set(this.computeTechnicalAssignees(tasks));
  this.funcAssignees.set(this.computeFunctionalAssignees(tasks));
  this.agingTable.set(this.computeAgingTable(tasks));
}
```

### `TaskView` Fields Required

The following fields must exist on `TaskView` (confirm with `TasksService`):

| Field | Type | Used In |
|---|---|---|
| `type` | `'FUNCTIONAL' \| 'TECHNICAL' \| string` | KPI cards 2 & 3, Tables 2 & 3 |
| `statusLabel` | `'new' \| 'todo' \| 'inprogress' \| 'done'` | All tables, donut |
| `priority` | `'HIGH' \| 'MEDIUM' \| 'LOW' \| null` | Donut chart |
| `assignee` | `string \| null` | Tables 2 & 3 |
| `updatedAt` | `string` (ISO) | Table 4 aging |
| `dueDate` | `string` (ISO) | Table 4 fallback |

---

## 10. Component Changes (TypeScript)

### Imports to Add

```typescript
import { CommonModule } from '@angular/common';
// No new Angular module imports needed — chart is pure SVG
```

### Methods to Add

| Method | Returns | Purpose |
|---|---|---|
| `computeMetrics(tasks)` | `OverviewMetrics` | KPI card values + health |
| `computeDonutSegments(tasks)` | `DonutSegment[]` | SVG donut paths |
| `onSegmentClick(priority)` | `void` | Toggle active segment |
| `getPriorityCount(priority)` | `number` | Centre label in donut |
| `computeStatusTable(tasks)` | `StatusRow[]` | Table 1 |
| `computeTechnicalAssignees(tasks)` | `AssigneeRow[]` | Table 2 |
| `computeFunctionalAssignees(tasks)` | `AssigneeRow[]` | Table 3 |
| `computeAgingTable(tasks)` | `AgingRow[]` | Table 4 |
| `healthClass()` | `string` | CSS class for health badge |
| `healthLabel()` | `string` | Text label for health badge |

### Methods to Remove (no longer needed)

- `getCompletionPercentage()` — replaced by `metrics().healthPct`
- `getTaskStatusColor()`, `getTaskStatusIcon()`, `getTaskStatusLabel()` — no longer used in template
- `getPriorityColor()` — replaced by donut segment colour map
- `recentTasks` signal — recent tasks list is removed

---

## 11. Design Tokens & Style Guide

### CSS Variables (add to component SCSS)

```scss
// KPI Cards
.kpi-card {
  background: var(--app-surface);
  border: 1px solid var(--app-border);
  border-left: 4px solid var(--accent);     // CSS custom property per card
  border-radius: 12px;
  padding: 20px 24px;
  display: flex;
  align-items: center;
  gap: 16px;
  transition: box-shadow 0.2s ease, transform 0.2s ease;

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
    transform: translateY(-2px);
  }

  .kpi-value {
    font-size: 2.2rem;
    font-weight: 700;
    line-height: 1;
    color: var(--app-text);
  }

  .kpi-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--app-text-muted);
    margin-top: 4px;
  }
}

// Donut chart
.donut-segment {
  cursor: pointer;
  transition: stroke-width 0.2s ease;

  &.active {
    stroke-width: 34;   // slightly thicker = "pop-out" effect
  }
}

.donut-center-value {
  font-size: 28px;
  font-weight: 700;
  fill: var(--app-text);
  text-anchor: middle;
}

.donut-center-label {
  font-size: 11px;
  fill: var(--app-text-muted);
  text-anchor: middle;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

// Data tables
.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;

  thead tr {
    background: var(--app-hover);
    cursor: pointer;

    th {
      padding: 10px 14px;
      text-align: left;
      font-weight: 600;
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--app-text-muted);
      white-space: nowrap;
    }
  }

  tbody tr {
    border-bottom: 1px solid var(--app-border);
    transition: background 0.15s;

    &:hover { background: var(--app-hover); }
    &:nth-child(even) { background: rgba(0,0,0,0.02); }
  }

  td {
    padding: 10px 14px;
    color: var(--app-text);
  }
}

// Health badge
.health-badge {
  display: inline-block;
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 600;
  margin-top: 6px;

  &.healthy  { background: #dcfce7; color: #166534; }
  &.at-risk  { background: #fef3c7; color: #92400e; }
  &.critical { background: #fee2e2; color: #991b1b; }
}

// Aging highlight
.aging-warn  { color: #f59e0b; font-weight: 600; }
.aging-crit  { color: #ef4444; font-weight: 600; }
```

---

## 12. Visual Layout Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  H E A D E R                                                                │
│  "Project Overview"  ·  [CSO badge?]  ·  project.name                      │
└─────────────────────────────────────────────────────────────────────────────┘

ROW 1 — KPI METRIC CARDS (4 equal columns)
┌────────────────┐ ┌────────────────┐ ┌────────────────┐ ┌────────────────┐
│ 🔵 Total Tasks │ │ 🩵 Functional  │ │ 🟡 Technical   │ │ ❤️  Health %   │
│                │ │                │ │                │ │                │
│   128          │ │   74           │ │   54           │ │   82%          │
│   TOTAL TASKS  │ │ FUNCTIONAL     │ │ TECHNICAL      │ │ [Healthy]      │
└────────────────┘ └────────────────┘ └────────────────┘ └────────────────┘

ROW 2 — CHART + STATUS TABLE (2 columns: 55% / 45%)
┌──────────────────────────────────┐ ┌──────────────────────────────────────┐
│  Tasks by Priority               │ │  Status × Count                      │
│                                  │ │                                      │
│     ┌──────────┐  ■ HIGH   42    │ │  Status      Count    % Total        │
│     │  ◐ SVG   │  ■ MED    61    │ │  New         12       9%  ░░         │
│     │  DONUT   │  ■ LOW    25    │ │  To Do       28       22% ░░░░       │
│     │  CHART   │                 │ │  In Progress 45       35% ░░░░░░     │
│     └──────────┘                 │ │  Done        43       34% ░░░░░░     │
│   Click segment → shows count    │ │                                      │
└──────────────────────────────────┘ └──────────────────────────────────────┘

ROW 3 — THREE TABLES (3 equal columns)
┌──────────────────────┐ ┌──────────────────────┐ ┌──────────────────────┐
│ Technical Assignees  │ │ Functional Assignees  │ │ Status × Aging       │
│                      │ │                       │ │                      │
│ Assignee  Tot  Done  │ │ Assignee  Tot  Done   │ │ Status  Avg  Max     │
│ John      18   12    │ │ Anna      22   15     │ │ New     5d   12d     │
│ Priya     14    8    │ │ Mark      19   11     │ │ To Do   3d   8d      │
│ Sam       12    5    │ │ Lisa      15    9     │ │ Progres 7d  18d ⚠️   │
│ ...                  │ │ ...                   │ │ Done    2d   6d      │
└──────────────────────┘ └──────────────────────┘ └──────────────────────┘

ROW 4 — EXISTING CARDS (2 columns: 50% / 50%)
┌────────────────────────────────┐ ┌──────────────────────────────────────┐
│  Project Information (KEEP)    │ │  Sprint Status (KEEP)                │
│  Created By: John Doe          │ │  Active: 1  Planned: 2  Done: 3      │
│  Status: Active                │ │  ▶ Sprint 4: Foundation              │
│  Type: ERP                     │ │    2026-08-01 → 2026-08-15           │
│  Customer: Acme Corp           │ │                                      │
└────────────────────────────────┘ └──────────────────────────────────────┘
```

---

## Implementation Checklist

- [ ] **Row 1:** Create 4 `.kpi-card` elements with computed `metrics()` signal values
- [ ] **Row 1:** Implement `computeMetrics()` with health formula and colour thresholds
- [ ] **Row 2 Left:** Implement SVG donut with `computeDonutSegments()` and `onSegmentClick()`
- [ ] **Row 2 Left:** Wire donut centre label to `activePriority()` / `getPriorityCount()`
- [ ] **Row 2 Right:** Render `statusTable()` signal in an HTML table
- [ ] **Row 3 Left:** Render `techAssignees()` in compact table
- [ ] **Row 3 Centre:** Render `funcAssignees()` in compact table
- [ ] **Row 3 Right:** Render `agingTable()` with `aging-warn` / `aging-crit` highlight classes
- [ ] **Row 4:** Move existing Project Info and Sprint Status blocks to bottom row
- [ ] **Remove** stat-cards grid, progress bar, and recent-tasks list from HTML
- [ ] **Remove** now-unused methods from TS (`getCompletionPercentage`, `getPriorityColor`, etc.)
- [ ] **Add** new SCSS rules for `.kpi-card`, `.donut-*`, `.data-table`, `.health-badge`, `.aging-*`
- [ ] **Verify** `TaskView` has `type`, `priority`, `assignee`, `updatedAt` fields

---

*Last updated: 2026-08-19 | Component: `ProjectOverviewComponent` | Module: `features/projects`*
