import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { ProjectsService } from '../../services/projects.service';
import { TasksService } from '../../../../core/services/tasks.service';
import { NotificationService } from '../../../../core/services/notification.service'; 
import { ProjectDetailHeaderComponent } from './components/header/project-detail-header.component';
import { ProjectNavTabsComponent } from './components/nav-tabs/project-nav-tabs.component';
import { ProjectKanbanComponent } from './components/kanban/project-kanban.component';
import { ProjectTaskListComponent } from './components/task-list/project-task-list.component';
import { ProjectTeamComponent } from './components/team/project-team.component';
import { ProjectSprintComponent } from './components/sprint/project-sprint.component';
import { ProjectOverviewComponent } from './components/overview/project-overview.component';
import { CreateTaskModalComponent, type TaskFormData } from '../../components/modals/create-task/create-task-modal.component';
import {
  CreateProjectModalComponent,
  type ProjectFormData,
} from '../../components/modals/create-project/create-project-modal.component';
import type { CreateTaskRequest, Project } from '@sebsa-pm-tool/shared-models';

@Component({
  standalone: true,
  selector: 'app-project-detail',
  imports: [
    CommonModule,
    ProjectDetailHeaderComponent,
    ProjectNavTabsComponent,
    ProjectKanbanComponent,
    ProjectTaskListComponent,
    ProjectTeamComponent,
    ProjectSprintComponent,
    ProjectOverviewComponent,
    CreateTaskModalComponent,
    CreateProjectModalComponent,
  ],
  templateUrl: './project-detail.page.html',
  styleUrl: './project-detail.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectDetailPageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private projectsService = inject(ProjectsService);
  private tasksService = inject(TasksService);
  private notificationService = inject(NotificationService);

  readonly project = signal<Project | null>(null);
  readonly isLoading = signal(false);
  readonly errorMessage = signal('');

  activeTab: 'overview' | 'kanban' | 'tasklist' | 'calendar' | 'sprint' | 'team' = 'kanban';
  isTaskModalOpen = false;
  isEditModalOpen = false;

  ngOnInit(): void {
    const projectId = this.route.snapshot.paramMap.get('id');
    if (!projectId) {
      this.router.navigate(['/projects']);
      return;
    }
    this.loadProject(projectId);
  }

  private loadProject(projectId: string): void {
    this.isLoading.set(true);
    this.errorMessage.set('');
    this.projectsService.getProject(projectId).subscribe({
      next: (project) => {
        this.project.set(project);
        this.tasksService.loadTasks(project.id, project.workflowStages);
        this.isLoading.set(false);
      },
      error: () => {
        this.isLoading.set(false);
        this.router.navigate(['/projects']);
      },
    });
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
    const current = this.project();
    if (!current) {
      return;
    }

    if (!current.workflowStages.length) {
      this.errorMessage.set('This project does not have any workflow stages configured.');
      return;
    }

    const dto: CreateTaskRequest = {
      projectId: current.id,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priority: formData.priority,
      workflowStageId: current.workflowStages[0].id,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      isCsoLabeled: formData.isCsoLabeled,
    };

    this.isLoading.set(true);
    this.tasksService.createTask(dto, current.workflowStages).subscribe({
      next: () => {
        this.isLoading.set(false);
        this.closeTaskModal();
        this.notificationService.success(`Task "${formData.title}" created successfully!`);
      },
      error: () => {
        this.isLoading.set(false);
        this.errorMessage.set('Failed to create task. Please try again.');
        this.notificationService.error('Failed to create task. Please try again.');
      },
    });
  }


  onEditClick(): void {
    this.isEditModalOpen = true;
  }

  closeEditModal(): void {
    this.isEditModalOpen = false;
  }

  onEditProject(formData: ProjectFormData): void {
    const current = this.project();
    if (!current) return;

    this.errorMessage.set('');
    this.projectsService
      .updateProject(current.id, {
        name: formData.name,
        description: formData.description || undefined,
        type: formData.type,
        customType: formData.customType,
        isCsoProject: formData.isCsoProject,
        customerName: formData.customerName || null,
      })
      .subscribe({
        next: (updated) => {
          this.project.set(updated);
          this.closeEditModal();
        },
        error: () => {
          this.errorMessage.set('Failed to update project. Please try again.');
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/projects']);
  }
}
