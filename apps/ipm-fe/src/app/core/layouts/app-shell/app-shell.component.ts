import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { ToastComponent } from '../../components/toast/toast.component';
import { CreateCaseModalComponent, type CaseFormData } from '../../../features/cases/create-case/create-case-modal.component';
import { CasesService } from '../../services/cases.service';
import { NotificationService } from '../../services/notification.service';
import type { CreateCaseRequest, SystemRole } from '@sebsa-pm-tool/shared-models';

@Component({
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastComponent, CreateCaseModalComponent],
  selector: 'app-shell',
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent implements OnInit {
  private readonly router = inject(Router);
  protected readonly authService = inject(AuthService);
  protected readonly themeService = inject(ThemeService);
  private readonly casesService = inject(CasesService);
  private readonly notificationService = inject(NotificationService);

  private readonly navigationItems: { label: string; icon: string; path: string; hiddenForRoles?: SystemRole[] }[] = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'My Tasks', icon: 'search', path: '/tasks' },
    { label: 'Projects', icon: 'favorite', path: '/projects' },
    { label: 'Customers', icon: 'domain', path: '/customers', hiddenForRoles: ['REGULAR_USER'] },
    { label: 'CSO', icon: 'groups', path: '/cso' },
    { label: 'Calendar', icon: 'calendar_month', path: '/calendar' },
  ];

  protected get visibleNavigationItems() {
    const role = this.authService.currentUser()?.systemRole;
    return this.navigationItems.filter((item) => !item.hiddenForRoles || !role || !item.hiddenForRoles.includes(role));
  }

  protected isTaskModalOpen = false;
  protected lastCreatedTask: CaseFormData | null = null;
  protected isProfileMenuOpen = false;
  protected isNotificationMenuOpen = false;

  protected readonly notificationPreview = [
    { id: '1', icon: 'assignment_ind', title: 'New task assigned to you', detail: '"Fix login redirect bug" was assigned by Hiruni Wijethilaka', time: '5m ago', read: false },
    { id: '2', icon: 'chat_bubble', title: 'New comment on your task', detail: 'Nadeesha commented on "Update API docs"', time: '1h ago', read: false },
    { id: '3', icon: 'alternate_email', title: 'You were mentioned', detail: 'Kasun mentioned you in "Sprint 12 Planning"', time: '3h ago', read: false },
    { id: '4', icon: 'campaign', title: 'Project status updated', detail: '"Customer Portal Revamp" moved to In Review', time: 'Yesterday', read: true },
  ] as const;

  ngOnInit(): void {
    // Theme service auto-initializes data-theme on document.documentElement from localStorage or system preference
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    this.isNotificationMenuOpen = false;
  }

  protected toggleNotificationMenu(): void {
    this.isNotificationMenuOpen = !this.isNotificationMenuOpen;
    this.isProfileMenuOpen = false;
  }

  protected goToAllNotifications(): void {
    this.isNotificationMenuOpen = false;
    this.router.navigate(['/notifications']);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: MouseEvent): void {
    if (!this.isNotificationMenuOpen && !this.isProfileMenuOpen) {
      return;
    }
    const target = event.target as HTMLElement;
    if (this.isNotificationMenuOpen && !target.closest?.('.notification-menu-wrapper')) {
      this.isNotificationMenuOpen = false;
    }
    if (this.isProfileMenuOpen && !target.closest?.('.profile-menu-wrapper')) {
      this.isProfileMenuOpen = false;
    }
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

  protected handleTaskSaved(formData: CaseFormData): void {
    if (!formData.projectId) return;

    const dto: CreateCaseRequest = {
      projectId: formData.projectId,
      title: formData.title,
      description: formData.description || undefined,
      type: formData.type,
      priorityId: formData.priorityId,
      dueDate: formData.dueDate || undefined,
      sprintId: formData.sprintId || undefined,
      assigneeIds: formData.assigneeIds.length > 0 ? formData.assigneeIds : undefined,
      isCsoLabeled: formData.isCsoLabeled,
      category: formData.category,
    };

    this.casesService.createCase(dto).subscribe({
      next: () => {
        this.notificationService.success(`Case "${formData.title}" created successfully!`);
        this.closeTaskModal();
      },
      error: () => {
        this.notificationService.error('Failed to create case. Please try again.');
      },
    });
  }
}