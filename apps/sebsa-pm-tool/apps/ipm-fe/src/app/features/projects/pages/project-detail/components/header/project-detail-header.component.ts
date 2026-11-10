import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Project, ProjectStatus } from '@sebsa-pm-tool/shared-models';

const STATUS_LABELS: Record<ProjectStatus, string> = {
  PLANNING: 'Planning',
  ACTIVE: 'Active',
  ON_HOLD: 'On Hold',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

@Component({
  standalone: true,
  selector: 'project-detail-header',
  imports: [CommonModule],
  template: `
    <header class="project-header">
      <div class="header-left">
        <button type="button" class="back-btn" (click)="onBackClick()" title="Go back">
          <span class="material-symbols-outlined">arrow_back</span>
        </button>

        <div class="project-intro">
          <div class="project-avatar">{{ getInitials() }}</div>
          <div class="project-info">
            <h1>{{ project.name }}</h1>
            <p class="project-owner">By {{ project.createdBy.name }}</p>
          </div>
        </div>
      </div>

      <div class="header-right">
        <span class="badge" [class]="statusClass()">
          {{ statusLabel() }}
        </span>
        @if (project.permissions.canManageMembers) {
          <button type="button" class="edit-btn" (click)="onEditClick()" title="Edit project">
            <span class="material-symbols-outlined">edit</span>
            Edit
          </button>
        }
      </div>
    </header>
  `,
  styles: [`
    .project-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 20px;
      padding: 20px 24px;
      background: var(--app-surface);
      border-bottom: 1px solid var(--app-border);
      flex-wrap: wrap;

      @media (min-width: 768px) {
        padding: 24px 32px;
        gap: 24px;
      }
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
      flex: 1;
      min-width: 0;
    }

    .back-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      padding: 0;
      background: transparent;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      color: var(--app-text);
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;

      .material-symbols-outlined {
        font-size: 20px;
      }

      &:hover {
        background: var(--app-hover);
        border-color: var(--app-accent);
        color: var(--app-accent);
      }
    }

    .project-intro {
      display: flex;
      align-items: center;
      gap: 16px;
      min-width: 0;
    }

    .project-avatar {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      background: linear-gradient(135deg, var(--app-accent-soft), rgba(217, 37, 97, 0.05));
      color: var(--app-accent);
      border-radius: 10px;
      font-weight: 700;
      font-size: 1rem;
      flex-shrink: 0;
    }

    .project-info {
      min-width: 0;

      h1 {
        margin: 0;
        color: var(--app-text);
        font-size: 1.3rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;

        @media (min-width: 768px) {
          font-size: 1.5rem;
        }
      }

      .project-owner {
        margin: 4px 0 0;
        color: var(--app-text-muted);
        font-size: 0.85rem;
      }
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.75rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      white-space: nowrap;

      &.planning {
        background: rgba(100, 116, 139, 0.15);
        color: #475569;
      }

      &.active {
        background: rgba(16, 185, 129, 0.15);
        color: #047857;
      }

      &.on-hold {
        background: rgba(245, 158, 11, 0.15);
        color: #b45309;
      }

      &.completed {
        background: rgba(37, 99, 235, 0.15);
        color: #1d4ed8;
      }

      &.archived {
        background: rgba(239, 68, 68, 0.15);
        color: #991b1b;
      }
    }

    .edit-btn {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 8px 14px;
      background: transparent;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      color: var(--app-text);
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;

      .material-symbols-outlined {
        font-size: 18px;
      }

      &:hover {
        background: var(--app-hover);
        border-color: var(--app-accent);
        color: var(--app-accent);
      }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailHeaderComponent {
  @Input() project!: Project;
  @Output() backClick = new EventEmitter<void>();
  @Output() editClick = new EventEmitter<void>();

  getInitials(): string {
    return this.project.name
      .split(' ')
      .map((word: string) => word[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  statusClass(): string {
    return this.project.status.toLowerCase().replace(/_/g, '-');
  }

  statusLabel(): string {
    return STATUS_LABELS[this.project.status] ?? this.project.status;
  }

  onBackClick(): void {
    this.backClick.emit();
  }

  onEditClick(): void {
    this.editClick.emit();
  }
}
