import {
  Component,
  Input,
  ChangeDetectionStrategy,
  inject,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CasesService, CASE_STATUSES, type CaseView } from '../../../../../../core/services/cases.service';
import type { CaseStatus } from '@sebsa-pm-tool/shared-models';

/** Case board — grouped by the fixed, global CaseStatus lifecycle (no more
 * per-project custom WorkflowStage columns / "Add Column"). */
@Component({
  standalone: true,
  selector: 'project-kanban',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-kanban.component.html',
  styleUrl: './project-kanban.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectKanbanComponent {
  @Input() projectId!: string;

  private readonly casesService = inject(CasesService);
  private readonly router = inject(Router);

  readonly statuses = CASE_STATUSES;
  readonly errorMessage = '';

  readonly cases = computed<Record<string, CaseView[]>>(() => {
    const allCases = this.casesService.cases();
    const map: Record<string, CaseView[]> = {};
    for (const status of this.statuses) {
      map[status.id] = allCases.filter((c) => c.projectId === this.projectId && c.status === status.id);
    }
    return map;
  });

  // ─── Drag state ───────────────────────────────────────────────────────────
  draggedCase: CaseView | null = null;

  onDragStart(kase: CaseView): void {
    this.draggedCase = kase;
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.dataTransfer!.dropEffect = 'move';
  }

  onDrop(event: DragEvent, targetStatus: CaseStatus): void {
    event.preventDefault();

    const kase = this.draggedCase;
    this.draggedCase = null;

    if (!kase || kase.status === targetStatus) return;

    const originalStatus = kase.status;
    this.casesService.patchCaseStatusLocally(kase.id, targetStatus);

    this.casesService.updateCaseStatus(kase.id, targetStatus).subscribe({
      error: (err) => {
        console.error('Failed to move case:', err);
        this.casesService.patchCaseStatusLocally(kase.id, originalStatus);
      },
    });
  }

  onDragEnd(): void {
    this.draggedCase = null;
  }

  openCaseDetail(caseId: string): void {
    this.router.navigate(['/cases', caseId]);
  }

  getCaseInitials(name: string): string {
    return name
      .split(' ')
      .map((word) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  getTypeLabel(type: string): string {
    switch (type) {
      case 'EPIC':
        return 'Epic';
      case 'STORY':
        return 'Story';
      case 'BUG':
        return 'Bug';
      case 'IMPROVEMENT':
        return 'Improvement';
      case 'TEST':
        return 'Test';
      case 'GENERAL':
        return 'General';
      default:
        return type;
    }
  }

  getTypeClass(type: string): string {
    return `type-${type.toLowerCase()}`;
  }
}
