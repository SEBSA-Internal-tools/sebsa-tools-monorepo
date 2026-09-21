import { ChangeDetectionStrategy, Component, Input, OnChanges, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { JiraProjectLink, ProjectsService } from '../../../../services/projects.service';
import { ToastService } from '../../../../../../core/services/toast.service';

/**
 * Per-project integration settings. Only Jira today, and only the project ->
 * Jira project link: individual issues are attached to a case from the case
 * itself, since that is where the result shows up.
 */
@Component({
  standalone: true,
  selector: 'project-integrations',
  imports: [CommonModule, FormsModule],
  templateUrl: './project-integrations.component.html',
  styleUrl: './project-integrations.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectIntegrationsComponent implements OnChanges {
  @Input({ required: true }) projectId!: string;

  private readonly projectsService = inject(ProjectsService);
  private readonly toast = inject(ToastService);

  protected readonly link = signal<JiraProjectLink | null>(null);
  protected readonly isLoading = signal(false);
  protected readonly isSaving = signal(false);
  protected readonly isEditing = signal(false);
  protected readonly errorMessage = signal('');

  protected projectKeyDraft = '';

  ngOnChanges(): void {
    this.isEditing.set(false);
    this.load();
  }

  protected load(): void {
    if (!this.projectId) return;

    this.isLoading.set(true);
    this.errorMessage.set('');

    this.projectsService.getJiraLink(this.projectId).subscribe({
      next: (link) => {
        this.link.set(link);
        this.isLoading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        // 403 is a permissions answer, not a failure worth a red banner.
        this.errorMessage.set(
          error.status === 403
            ? 'You do not have permission to manage this project\'s integrations.'
            : 'Could not load integration settings.',
        );
        this.isLoading.set(false);
      },
    });
  }

  protected startEdit(): void {
    this.projectKeyDraft = this.link()?.jiraProjectKey ?? '';
    this.isEditing.set(true);
  }

  protected cancelEdit(): void {
    this.isEditing.set(false);
    this.projectKeyDraft = '';
  }

  protected save(): void {
    const key = this.projectKeyDraft.trim().toUpperCase();
    if (!key || this.isSaving()) return;

    this.isSaving.set(true);
    this.projectsService.linkJiraProject(this.projectId, key).subscribe({
      next: () => {
        this.toast.success(`Linked to Jira project ${key}.`);
        this.cancelEdit();
        this.isSaving.set(false);
        this.load();
      },
      error: (error: HttpErrorResponse) => {
        // The API verifies the key against Jira, so a typo is reported here.
        this.toast.error(error.error?.message ?? 'Could not link to that Jira project.');
        this.isSaving.set(false);
      },
    });
  }

  protected unlink(): void {
    const current = this.link();
    if (!current) return;

    const warning = current.linkedCaseCount
      ? `Stop syncing with ${current.jiraProjectKey}? ${current.linkedCaseCount} case(s) will keep what they last pulled but stop updating.`
      : `Stop syncing with ${current.jiraProjectKey}?`;
    if (!window.confirm(warning)) return;

    this.projectsService.unlinkJiraProject(this.projectId).subscribe({
      next: () => {
        this.toast.success('Unlinked from Jira.');
        this.load();
      },
      error: (error: HttpErrorResponse) =>
        this.toast.error(error.error?.message ?? 'Could not unlink.'),
    });
  }
}
