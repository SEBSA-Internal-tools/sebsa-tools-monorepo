# Sprint Feature — Quick Reference Guide

## 🚀 Getting Started

### View Sprint Tab
Navigate to any project detail page and click the **"Sprint"** tab to see the sprint tree view.

### Add a Sprint (PM Only)
1. Click the **"Add Sprint"** button in the header
2. Fill in:
   - Sprint Name (required)
   - Start Date (required)
   - End Date (required)
   - Description (optional)
3. Click **"Create Sprint"**
4. Sprint appears in the tree view

### Expand/Collapse Sprints
Click the **expand/collapse** button on each sprint to show/hide its tasks.

---

## 📊 Sprint Information

### Sprint Status Badges
- 🟢 **Active** — Currently in progress
- 🟦 **Completed** — Finished
- 🟨 **Planned** — Not yet started

### Progress Bar
Shows visual representation of task completion:
- Green fill = Completed tasks
- Gray background = Incomplete tasks
- Percentage shown = (Completed / Total) × 100

### Statistics Displayed
- Total tasks in sprint
- Completed tasks (shown in progress bar)
- Date range (start to end)

---

## 🎯 Tasks in Sprints

### Viewing Tasks
Tasks automatically appear under their sprint when:
1. Sprint is expanded (click toggle button)
2. Task has been assigned to the sprint (via `sprintId`)

### Task Information Shown
- Task ID (e.g., PMT-089)
- Task title
- Category (badge)
- Status (New, To Do, In Progress, Done)
- Priority (High, Medium, Low)
- Assignee (if assigned)
- Due date (if set)

### Task Organization
```
Sprint 1: Foundation Setup
  ├─ PMT-001: Setup database schema
  ├─ PMT-002: Configure API server
  └─ PMT-003: Deploy to staging

Sprint 2: Data Migration
  ├─ PMT-004: Export legacy data
  ├─ PMT-005: Transform data format
  └─ PMT-006: Validate and import
```

---

## 🔐 Permissions

### Project Managers (PM) Can:
- ✅ View all sprints
- ✅ Create new sprints
- ✅ Delete sprints
- ✅ Update sprint status
- ✅ View all tasks

### Developers Can:
- ✅ View all sprints
- ✅ View all tasks
- ❌ Create/delete sprints

### Viewers Can:
- ✅ View all sprints
- ✅ View all tasks
- ❌ Make any changes

---

## 📝 API Reference

### Service Methods

```typescript
// Get sprints for a project
projectsService.getSprints(projectId: string): Sprint[]

// Get tasks for a sprint
projectsService.getSprintTasks(sprintId: string): Task[]

// Create new sprint
projectsService.createSprint({
  name: string;
  projectId: string;
  startDate: string;
  endDate: string;
  description?: string;
}): Sprint

// Delete sprint (orphans its tasks)
projectsService.deleteSprint(sprintId: string): void

// Update sprint status
projectsService.updateSprintStatus(
  sprintId: string, 
  status: 'planned' | 'active' | 'completed'
): void

// Get sprint statistics
getSprintStats(sprintId: string): {
  total: number;
  completed: number;
  inProgress: number;
}
```

---

## 🎨 Colors & Styling

### Sprint Status Colors
| Status | Color | Hex |
|--------|-------|-----|
| Active | Green | #10b981 |
| Completed | Blue | #3730a3 |
| Planned | Amber | #92400e |

### Task Priority Colors
| Priority | Color | Hex |
|----------|-------|-----|
| High | Red | #991b1b |
| Medium | Orange | #9a3412 |
| Low | Blue | #1e40af |

### Task Status Colors
| Status | Color | Hex |
|--------|-------|-----|
| New | Gray | #6b7280 |
| To Do | Amber | #92400e |
| In Progress | Blue | #1e3a8a |
| Done | Green | #166534 |

---

## 🔧 Development

### Component Structure
```
project-sprint/
├── project-sprint.component.ts     # Main logic
├── project-sprint.component.html   # Template
├── project-sprint.component.scss   # Styles
└── (add-sprint modal in modals/)
```

### Key Signals
```typescript
sprints = signal<Sprint[]>([])              // Sprint list
expandedSprints = signal<ExpandedState>({}) // Track expanded sprints
isModalOpen = signal(false)                 // Modal visibility
userRole = signal<UserRole>('PM')          // User permission level
```

### Main Methods
```typescript
loadSprints()                  // Load all sprints
toggleSprint(sprintId)        // Expand/collapse
getSprintTasks(sprintId)      // Get tasks
getSprintStats(sprintId)      // Calculate stats
onOpenAddSprintModal()        // Open create dialog
onAddSprint(formData)         // Create sprint
onDeleteSprint(sprintId)      // Delete sprint
canAddSprint(): boolean       // Permission check
```

---

## 🧪 Testing

### Test Cases
```typescript
// Check if sprints load
expect(component.sprints().length).toBeGreaterThan(0);

// Verify expand/collapse
component.toggleSprint('SPR-001');
expect(component.expandedSprints()['SPR-001']).toBeTrue();

// Check permissions
component.userRole.set('DEVELOPER');
expect(component.canAddSprint()).toBeFalse();

// Verify modal open/close
component.onOpenAddSprintModal();
expect(component.isModalOpen()).toBeTrue();
```

---

## ⚡ Performance Tips

1. **Lazy Load**: Sprint component loads only when tab is selected
2. **OnPush Detection**: Component updates only on input changes
3. **Track Function**: Tree view efficiently re-renders with `track member.id`
4. **Signals**: Fine-grained reactivity reduces unnecessary renders

---

## 🐛 Common Issues

| Issue | Solution |
|-------|----------|
| No "Add Sprint" button | Check user role is 'PM' |
| Tasks not showing | Expand sprint (click toggle) |
| Empty tree | No sprints created yet (click "Create First Sprint") |
| Styles not loading | Clear cache and rebuild |
| Modal won't close | Check form validation passes |

---

## 📚 Related Resources

- Full Documentation: `SPRINT_FEATURE_IMPLEMENTATION.md`
- Service Reference: `projects.service.ts`
- Component Code: `project-sprint.component.ts`
- Modal Code: `add-sprint-modal.component.ts`

---

**Last Updated:** 2026-07-23  
**Status:** Production Ready ✅
