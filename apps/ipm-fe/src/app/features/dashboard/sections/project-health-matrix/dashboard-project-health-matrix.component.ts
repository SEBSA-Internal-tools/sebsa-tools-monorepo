import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnChanges,
  SimpleChanges,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectHealthMatrix } from '../../services/dashboard.service';

export type SortField =
  | 'projectName'
  | 'status'
  | 'healthStatus'
  | 'completionPercentage'
  | 'timeline'
  | 'risks';

export type SortDirection = 'asc' | 'desc';

@Component({
  standalone: true,
  selector: 'app-dashboard-project-health-matrix',
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard-project-health-matrix.component.html',
  styleUrl: './dashboard-project-health-matrix.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardProjectHealthMatrixComponent implements OnChanges {
  private readonly router = inject(Router);

  readonly allProjects = signal<ProjectHealthMatrix[]>([]);
  readonly cardFilterSignal = signal<string | null>(null);

  @Input()
  set projectHealthMatrix(value: ProjectHealthMatrix[] | null) {
    this.allProjects.set(value ?? []);
  }
  get projectHealthMatrix(): ProjectHealthMatrix[] | null {
    return this.allProjects();
  }

  @Input()
  set activeCardFilter(value: string | null) {
    this.cardFilterSignal.set(value);
  }
  get activeCardFilter(): string | null {
    return this.cardFilterSignal();
  }

  @Output() clearCardFilter = new EventEmitter<void>();

  readonly searchQuery = signal<string>('');
  readonly selectedStatusFilter = signal<string>('ALL');

  readonly sortField = signal<SortField>('risks');
  readonly sortDirection = signal<SortDirection>('desc');

  readonly statusTabs = [
    { label: 'All Projects', value: 'ALL' },
    { label: 'Active', value: 'ACTIVE' },
    { label: 'Planning', value: 'PLANNING' },
    { label: 'Completed', value: 'COMPLETED' },
    { label: 'On Hold', value: 'ON_HOLD' },
  ];

  readonly filteredProjects = computed<ProjectHealthMatrix[]>(() => {
    const list = this.allProjects();
    const query = this.searchQuery().trim().toLowerCase();
    const status = this.selectedStatusFilter();
    const cardFilter = this.cardFilterSignal();

    // 1. Filter phase
    const filtered = list.filter((project) => {
      // Search query
      if (query && !project.projectName.toLowerCase().includes(query)) {
        return false;
      }

      // Status pill filter
      if (status !== 'ALL' && project.status !== status) {
        return false;
      }

      // Interactive summary card filter
      if (cardFilter) {
        switch (cardFilter) {
          case 'ACTIVE_PROJECTS':
            if (project.status !== 'ACTIVE') return false;
            break;
          case 'OPEN_TASKS':
            if ((project.totalTasks ?? 0) <= (project.completedTasks ?? 0)) return false;
            break;
          case 'RISKS':
            if (project.risks <= 0 && project.healthStatus !== 'danger' && project.healthStatus !== 'warning') {
              return false;
            }
            break;
          case 'DELIVERY_HEALTH':
            if ((project.completionPercentage ?? 0) < 50) return false;
            break;
        }
      }

      return true;
    });

    // 2. Sort phase
    const field = this.sortField();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;

    return [...filtered].sort((a, b) => {
      switch (field) {
        case 'projectName':
          return a.projectName.localeCompare(b.projectName) * dir;
        case 'status':
          return (a.status || '').localeCompare(b.status || '') * dir;
        case 'healthStatus': {
          const score: Record<string, number> = { danger: 3, warning: 2, success: 1 };
          const aScore = score[a.healthStatus] || 0;
          const bScore = score[b.healthStatus] || 0;
          return (aScore - bScore) * dir;
        }
        case 'completionPercentage':
          return ((a.completionPercentage ?? 0) - (b.completionPercentage ?? 0)) * dir;
        case 'timeline':
          return ((a.timeline ?? 0) - (b.timeline ?? 0)) * dir;
        case 'risks':
          return ((a.risks ?? 0) - (b.risks ?? 0)) * dir;
        default:
          return 0;
      }
    });
  });

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['projectHealthMatrix']) {
      this.allProjects.set(this.projectHealthMatrix ?? []);
    }
  }

  setFilter(status: string): void {
    this.selectedStatusFilter.set(status);
  }

  onSearch(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.searchQuery.set(input.value);
  }

  toggleSort(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDirection.update((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      this.sortField.set(field);
      // Default to desc for metrics/risks, asc for names
      const defaultDesc = ['risks', 'completionPercentage', 'timeline'].includes(field);
      this.sortDirection.set(defaultDesc ? 'desc' : 'asc');
    }
  }

  cycleMobileSort(): void {
    const order: SortField[] = ['risks', 'completionPercentage', 'projectName', 'timeline'];
    const currentIdx = order.indexOf(this.sortField());
    const nextIdx = (currentIdx + 1) % order.length;
    this.toggleSort(order[nextIdx]);
  }

  getSortLabel(): string {
    const field = this.sortField();
    const dir = this.sortDirection() === 'asc' ? '↑' : '↓';
    switch (field) {
      case 'risks':
        return `Risks ${dir}`;
      case 'completionPercentage':
        return `Completion ${dir}`;
      case 'projectName':
        return `Name ${dir}`;
      case 'timeline':
        return `Timeline ${dir}`;
      case 'status':
        return `Status ${dir}`;
      case 'healthStatus':
        return `Health ${dir}`;
      default:
        return `Sorted`;
    }
  }

  getCardFilterDescription(): string {
    switch (this.activeCardFilter) {
      case 'ACTIVE_PROJECTS':
        return 'Filtered by: Active Projects';
      case 'OPEN_TASKS':
        return 'Filtered by: Projects with Open Tasks';
      case 'RISKS':
        return 'Filtered by: Blocked & At Risk Projects';
      case 'DELIVERY_HEALTH':
        return 'Filtered by: High Delivery Progress (≥ 50%)';
      default:
        return 'Filtered by selection';
    }
  }

  onClearCardFilter(): void {
    this.cardFilterSignal.set(null);
    this.clearCardFilter.emit();
  }

  resetAllFilters(): void {
    this.searchQuery.set('');
    this.selectedStatusFilter.set('ALL');
    this.cardFilterSignal.set(null);
    this.clearCardFilter.emit();
  }

  navigateToProject(project: ProjectHealthMatrix): void {
    if (project.id) {
      this.router.navigate(['/projects', project.id]);
    }
  }

  getHealthColor(status: string): string {
    switch (status) {
      case 'success':
        return '#10b981';
      case 'warning':
        return '#f59e0b';
      case 'danger':
        return '#ef4444';
      default:
        return '#6b7280';
    }
  }

  getStatusLabel(status?: string): string {
    switch (status) {
      case 'PLANNING':
        return 'Planning';
      case 'ACTIVE':
        return 'Active';
      case 'ON_HOLD':
        return 'On Hold';
      case 'COMPLETED':
        return 'Completed';
      case 'ARCHIVED':
        return 'Archived';
      default:
        return status || 'Active';
    }
  }

  getMetricClass(value: number): string {
    if (value >= 80) return 'metric-excellent';
    if (value >= 50) return 'metric-good';
    if (value >= 25) return 'metric-fair';
    return 'metric-poor';
  }

  trackByProjectName(index: number, item: ProjectHealthMatrix): string {
    return item.id || item.projectName;
  }
}
