import { CommonModule, DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Inject,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface NewTaskDraft {
  project: string;
  assignee: string;
  priority: TaskPriority;
  dueDate: string;
  description: string;
}

@Component({
  standalone: true,
  selector: 'app-task-modal',
  imports: [CommonModule, FormsModule],
  templateUrl: './task-modal.component.html',
  styleUrl: './task-modal.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskModalComponent implements OnChanges, OnDestroy {
  @Input() open = false;
  @Output() closed = new EventEmitter<void>();
  @Output() saved = new EventEmitter<NewTaskDraft>();

  protected readonly projectOptions = [
    'Q3 Platform Overhaul',
    'Mobile App Refresh',
    'Customer Portal Migration',
    'Design System Rollout',
  ];

  protected readonly priorityOptions: Array<{ label: string; value: TaskPriority }> = [
    { label: 'Crit', value: 'critical' },
    { label: 'High', value: 'high' },
    { label: 'Med', value: 'medium' },
    { label: 'Low', value: 'low' },
  ];

  protected readonly dueDateFormat = 'yyyy-MM-dd';

  protected task: NewTaskDraft = this.createDefaultTask();

  private previousBodyOverflow = '';

  constructor(@Inject(DOCUMENT) private readonly document: Document) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open']) {
      if (this.open) {
        this.task = this.createDefaultTask();
        this.lockBodyScroll();
      } else {
        this.unlockBodyScroll();
      }
    }
  }

  ngOnDestroy(): void {
    this.unlockBodyScroll();
  }

  @HostListener('document:keydown.escape')
  protected handleEscape(): void {
    if (this.open) {
      this.close();
    }
  }

  protected setPriority(priority: TaskPriority): void {
    this.task = { ...this.task, priority };
  }

  protected close(): void {
    this.closed.emit();
  }

  protected save(): void {
    this.saved.emit({ ...this.task });
    this.close();
  }

  private createDefaultTask(): NewTaskDraft {
    return {
      project: this.projectOptions[0],
      assignee: 'Sarah Jenkins',
      priority: 'high',
      dueDate: '2026-07-15',
      description: '',
    };
  }

  private lockBodyScroll(): void {
    this.previousBodyOverflow = this.document.body.style.overflow;
    this.document.body.style.overflow = 'hidden';
  }

  private unlockBodyScroll(): void {
    this.document.body.style.overflow = this.previousBodyOverflow;
  }
}
