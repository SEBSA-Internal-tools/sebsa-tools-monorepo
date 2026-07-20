import { Component, inject, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectsService } from '../../services/projects.service';
import { ProjectDetailHeaderComponent } from './components/header/project-detail-header.component';
import { ProjectNavTabsComponent } from './components/nav-tabs/project-nav-tabs.component';
import { ProjectKanbanComponent } from './components/kanban/project-kanban.component';
import { ProjectTaskListComponent } from './components/task-list/project-task-list.component';
import { CreateTaskModalComponent, type TaskFormData } from '../../components/modals/create-task/create-task-modal.component';
import type { ProjectItem } from '../../services/projects.service';

@Component({
  standalone: true,
  selector: 'app-project-detail',
  imports: [
    CommonModule,
    ProjectDetailHeaderComponent,
    ProjectNavTabsComponent,
    ProjectKanbanComponent,
    ProjectTaskListComponent,
    CreateTaskModalComponent,
  ],
  templateUrl: './project-detail.page.html',
  styleUrl: './project-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectsService = inject(ProjectsService);

  project: ProjectItem | null = null;
  activeTab: 'overview' | 'kanban' | 'tasklist' | 'calendar' | 'sprint' = 'kanban';
  isTaskModalOpen = false;

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (projectId) {
      const projects = this.projectsService.getAllProjects();
      this.project = projects.find((p) => p.id === projectId) || null;

      if (!this.project) {
        this.router.navigate(['/projects']);
      }
    }
  }

  onTabChange(tab: typeof this.activeTab): void {
    this.activeTab = tab;
  }

  onAddTaskClick(): void {
    this.isTaskModalOpen = true;
  }

  closeTaskModal(): void {
    this.isTaskModalOpen = false;
  }

  onCreateTask(formData: TaskFormData): void {
    this.projectsService.createTask(formData);
    this.closeTaskModal();
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }
}
