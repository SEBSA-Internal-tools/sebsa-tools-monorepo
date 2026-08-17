import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { ProjectsService, ProjectsHeroData } from '../../services/projects.service';
import { ProjectsHeroComponent } from './components/hero/projects-hero.component';
import { ProjectsListComponent } from './components/list/projects-list.component';
import {
  CreateProjectModalComponent,
  type ProjectFormData,
} from '../../components/modals/create-project/create-project-modal.component';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-projects-page',
  imports: [
    CommonModule,
    ProjectsHeroComponent,
    ProjectsListComponent,
    CreateProjectModalComponent,
  ],
  templateUrl: './projects-list.page.html',
  styleUrl: './projects-list.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPageComponent {
  private projectsService = inject(ProjectsService);

  readonly projects = signal<ProjectSummary[]>([]);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  heroData: ProjectsHeroData = this.projectsService.getHeroData();
  isModalOpen = false;

  constructor() {
    this.loadProjects();
  }

  private loadProjects(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.projectsService.getProjects().subscribe({
      next: (projects) => {
        this.projects.set(projects);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Failed to load projects. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  openCreateModal(): void {
    this.isModalOpen = true;
  }

  closeCreateModal(): void {
    this.isModalOpen = false;
  }

  onNewProject(): void {
    this.openCreateModal();
  }

  onCreateProject(formData: ProjectFormData): void {
    this.errorMessage.set('');
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
          this.errorMessage.set(
            error.error?.message ?? 'Failed to create project. Please try again.',
          );
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

  onDeleteProject(projectId: string): void {
    this.errorMessage.set('');
    this.projectsService.deleteProject(projectId).subscribe({
      next: () => this.loadProjects(),
      error: () => this.errorMessage.set('Failed to delete project. Please try again.'),
    });
  }
}
