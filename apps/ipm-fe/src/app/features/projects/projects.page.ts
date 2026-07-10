import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Observable } from 'rxjs';
import { ProjectsService } from './services/projects.service';
import { ProjectsHeroComponent } from './components/hero/projects-hero.component';
import { ProjectsListComponent } from './components/list/projects-list.component';
import { CreateProjectModalComponent, type ProjectFormData } from './components/modal/create-project-modal.component';
import type { ProjectsHeroData, ProjectItem } from './services/projects.service';

@Component({
  standalone: true,
  selector: 'app-projects-page',
  imports: [
    CommonModule,
    ProjectsHeroComponent,
    ProjectsListComponent,
    CreateProjectModalComponent,
  ],
  templateUrl: './projects.page.html',
  styleUrl: './projects.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsPageComponent {
  private projectsService = inject(ProjectsService);

  projects$: Observable<ProjectItem[]> = this.projectsService.getProjects();
  heroData: ProjectsHeroData = this.projectsService.getHeroData();
  isModalOpen = false;

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
    const newProject = {
      name: formData.name,
      owner: formData.teamMembers.length > 0 ? formData.teamMembers[0].name : 'You',
      status: 'Open' as const,
      visibility: 'Private' as const,
      lastUpdated: new Date().toLocaleDateString(),
      icon: 'folder',
    };
    this.projectsService.addProject(newProject);
    this.projects$ = this.projectsService.getProjects();
    this.closeCreateModal();
  }

  onSearch(query: string): void {
    if (query.trim()) {
      this.projects$ = this.projectsService.searchProjects(query);
    } else {
      this.projects$ = this.projectsService.getProjects();
    }
  }

  onDeleteProject(projectId: string): void {
    this.projectsService.deleteProject(projectId);
    this.projects$ = this.projectsService.getProjects();
  }
}