import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';
import { CsoOverviewService } from '../../../../core/services/cso-overview.service';
import { ProjectsService } from '../../../projects/services/projects.service';
import {
  CreateProjectModalComponent,
  type ProjectFormData,
} from '../../../projects/components/modals/create-project/create-project-modal.component';

@Component({
  standalone: true,
  selector: 'cso-dashboard-tab',
  imports: [CommonModule, CreateProjectModalComponent],
  templateUrl: './cso-dashboard-tab.component.html',
  styleUrl: './cso-dashboard-tab.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CsoDashboardTabComponent implements OnInit {
  private readonly projectsService = inject(ProjectsService);
  private readonly csoOverviewService = inject(CsoOverviewService);
  private readonly router = inject(Router);

  protected readonly csoTasks = this.csoOverviewService.tasks;
  protected readonly isLoadingTasks = this.csoOverviewService.isLoading;

  protected readonly allProjects = signal<ProjectSummary[]>([]);
  protected readonly csoProjects = computed(() =>
    this.allProjects().filter((project) => project.isCsoProject),
  );

  protected readonly overdueCount = computed(() => {
    const now = new Date();
    return this.csoTasks().filter(
      (task) => task.statusLabel !== 'done' && task.dueDate && new Date(task.dueDate) < now,
    ).length;
  });

  protected isModalOpen = false;
  protected errorMessage = '';

  ngOnInit(): void {
    this.loadProjects();
    this.csoOverviewService.load({});
  }

  private loadProjects(): void {
    this.projectsService.getProjects().subscribe({ next: (p) => this.allProjects.set(p) });
  }

  openCreateModal(): void {
    this.isModalOpen = true;
  }

  closeCreateModal(): void {
    this.isModalOpen = false;
  }

  onProjectClick(projectId: string): void {
    this.router.navigate(['/projects', projectId]);
  }

  onCreateProject(formData: ProjectFormData): void {
    this.errorMessage = '';
    this.projectsService
      .createProject({
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        customType: formData.customType,
        isCsoProject: formData.isCsoProject,
        customerId: formData.customerId,
      })
      .subscribe({
        next: (project) => {
          this.closeCreateModal();
          this.loadProjects();
          this.assignInitialMembers(project.id, formData.memberIds);
        },
        error: (error: HttpErrorResponse) => {
          this.errorMessage = error.error?.message ?? 'Failed to create project. Please try again.';
        },
      });
  }

  /** Best-effort: add the members picked in the create modal, using the project's default "Member" role. */
  private assignInitialMembers(projectId: string, memberIds: string[]): void {
    if (memberIds.length === 0) return;

    this.projectsService.getRoles(projectId).subscribe({
      next: (roles) => {
        const memberRole = roles.find((role) => role.name === 'Member');
        if (!memberRole) return;
        memberIds.forEach((userId) => {
          this.projectsService
            .addMember(projectId, { userId, roleId: memberRole.id })
            .subscribe({ error: () => undefined });
        });
      },
      error: () => undefined,
    });
  }
}
