import { Component, Input, ChangeDetectionStrategy, inject, OnInit, ChangeDetectorRef, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CasesService, CASE_STATUSES, type CaseView } from '../../../../../../core/services/cases.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CustomSelectComponent,
  type SelectOptionItem,
} from '../../../../../../core/components/custom-select/custom-select.component';

@Component({
  standalone: true,
  selector: 'project-task-list',
  imports: [CommonModule, FormsModule, CustomSelectComponent],
  templateUrl: './project-task-list.component.html',
  styleUrl: './project-task-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectTaskListComponent implements OnInit {
  @Input() projectId!: string;

  private casesService = inject(CasesService);
  private router = inject(Router);
  private cdr = inject(ChangeDetectorRef);
  private destroyRef = inject(DestroyRef);

  cases: CaseView[] = [];
  sortBy: 'status' | 'priority' | 'date' = 'status';
  readonly statusOrder = CASE_STATUSES.map((s) => s.id);
  readonly sortOptions: SelectOptionItem[] = [
    { value: 'status', label: 'Status' },
    { value: 'priority', label: 'Priority' },
    { value: 'date', label: 'Due Date' },
  ];

  ngOnInit(): void {
    this.casesService.cases$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.loadCases());
    this.loadCases();
  }

  loadCases(): void {
    if (!this.projectId) return;
    this.cases = this.casesService.getCasesByProject(this.projectId);
    this.sortCases();
    this.cdr.markForCheck();
  }

  openCase(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  getStatusLabel(kase: CaseView): string {
    return CASE_STATUSES.find((s) => s.id === kase.status)?.name ?? kase.status;
  }

  getStatusBadgeClass(kase: CaseView): string {
    switch (kase.status) {
      case 'TO_DO':
        return 'new';
      case 'IN_REVIEW':
      case 'BLOCKED':
      case 'IN_PROGRESS':
        return 'inprogress';
      case 'DONE':
        return 'done';
      case 'CANCELLED':
        return 'todo';
      default:
        return 'todo';
    }
  }

  sortCases(): void {
    switch (this.sortBy) {
      case 'priority':
        this.cases.sort((a, b) => {
          const priorityOrder = { High: 0, Medium: 1, Low: 2 };
          return (priorityOrder[a.priority as keyof typeof priorityOrder] ?? 999) -
                 (priorityOrder[b.priority as keyof typeof priorityOrder] ?? 999);
        });
        break;
      case 'date':
        this.cases.sort((a, b) => new Date(b.dueDate).getTime() - new Date(a.dueDate).getTime());
        break;
      case 'status':
      default:
        this.cases.sort((a, b) => this.statusOrder.indexOf(a.status) - this.statusOrder.indexOf(b.status));
    }
  }

  onSortChange(sort: typeof this.sortBy): void {
    this.sortBy = sort;
    this.sortCases();
  }

  getPriorityClass(priority: string): string {
    return priority.toLowerCase();
  }

  getTaskInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }
}
