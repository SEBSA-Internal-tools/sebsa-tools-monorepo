import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { ToastComponent } from '../../components/toast/toast.component';
import { CreateTaskModalComponent, type TaskFormData } from '../../../features/tasks/create-task/create-task-modal.component';
import { TasksService } from '../../services/tasks.service';
import { ProjectsService } from '../../../features/projects/services/projects.service';
import { NotificationService } from '../../services/notification.service';
import type { CreateTaskRequest } from '@sebsa-pm-tool/shared-models';

@Component({
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastComponent, CreateTaskModalComponent],
  selector: 'app-shell',
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  private readonly tasksService = inject(TasksService);
  private readonly projectsService = inject(ProjectsService);
  private readonly notificationService = inject(NotificationService);

  protected readonly navigationItems = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'My Tasks', icon: 'search', path: '/tasks' },
    { label: 'Projects', icon: 'favorite', path: '/projects' },
    { label: 'Customers', icon: 'domain', path: '/customers' },
    { label: 'CSO', icon: 'groups', path: '/cso' },
    { label: 'Calendar', icon: 'calendar_month', path: '/calendar' },
    { label: 'Notifications', icon: 'notifications', path: '/notifications' },
  ] as const;

  protected isTaskModalOpen = false;
  protected lastCreatedTask: TaskFormData | null = null;
  protected isProfileMenuOpen = false;

  ngOnInit(): void {
    // Theme service auto-initializes data-theme on document.documentElement from localStorage or system preference
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
  }

  protected logout(): void {
    this.isProfileMenuOpen = false;
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected openTaskModal(): void {
    this.isTaskModalOpen = true;
  }

  protected closeTaskModal(): void {
    this.isTaskModalOpen = false;
  }

  protected handleTaskSaved(formData: TaskFormData): void {
    if (!formData.projectId) return;
    
    this.projectsService.getProject(formData.projectId).subscribe({
      next: (project) => {
        if (!project.workflowStages.length) {
          this.notificationService.error('Project has no workflow stages.');
          return;
        }

        const dto: CreateTaskRequest = {
          projectId: project.id,
          title: formData.title,
          description: formData.description || undefined,
          type: formData.type,
          priorityId: formData.priorityId,
          workflowStageId: project.workflowStages[0].id,
          dueDate: formData.dueDate || undefined,
          sprintId: formData.sprintId || undefined,
          assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
          isCsoLabeled: formData.isCsoLabeled,
          category: formData.category,
        };

        this.tasksService.createTask(dto, project.workflowStages).subscribe({
          next: () => {
            this.notificationService.success(`Task "${formData.title}" created successfully!`);
            this.closeTaskModal();
          },
          error: () => {
            this.notificationService.error('Failed to create task. Please try again.');
          }
        });
      },
      error: () => {
        this.notificationService.error('Failed to fetch project details.');
      }
    });
  }
}