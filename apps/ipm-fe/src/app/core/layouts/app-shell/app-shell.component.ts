import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { CreateTaskModalComponent, type TaskFormData } from '../../../features/projects/components/modals/create-task/create-task-modal.component';

@Component({
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, CreateTaskModalComponent],
  selector: 'app-shell',
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  protected readonly navigationItems = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'My Tasks', icon: 'search', path: '/tasks' },
    { label: 'Projects', icon: 'favorite', path: '/projects' },
    { label: 'Calendar', icon: 'calendar_month', path: '/calendar' },
    { label: 'Notifications', icon: 'notifications', path: '/notifications' },
  ] as const;

  protected isTaskModalOpen = false;
  protected lastCreatedTask: TaskFormData | null = null;

  constructor(protected readonly themeService: ThemeService) {}

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }

  protected openTaskModal(): void {
    this.isTaskModalOpen = true;
  }

  protected closeTaskModal(): void {
    this.isTaskModalOpen = false;
  }

  protected handleTaskSaved(task: TaskFormData): void {
    this.lastCreatedTask = task;
    this.closeTaskModal();
  }

  protected setAccent(mode: 'pink' | 'blue' | 'emerald' | 'amber' | 'violet'): void {
    this.themeService.setAccent(mode);
  }
}