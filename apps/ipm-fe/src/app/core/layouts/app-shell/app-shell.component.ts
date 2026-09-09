import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { ToastComponent } from '../../components/toast/toast.component';
import { CreateCaseModalComponent, type CaseFormData } from '../../../features/cases/create-case/create-case-modal.component';
import { CasesService } from '../../services/cases.service';
import { ToastService } from '../../services/toast.service';
import { NotificationService } from '../../services/notification.service';
import type { CreateCaseRequest, NotificationDto, NotificationType, SystemRole } from '@sebsa-pm-tool/shared-models';

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
  private readonly toastService = inject(ToastService);
  protected readonly notificationService = inject(NotificationService);

  private readonly navigationItems: { label: string; icon: string; path: string; hiddenForRoles?: SystemRole[] }[] = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'Assigned Works', icon: 'assignment_ind', path: '/tasks' },
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

  ngOnInit(): void {
    // Initial fetch if user is logged in
    if (this.authService.currentUser()) {
      this.notificationService.refreshRecent();
    }
  }

  protected toggleProfileMenu(): void {
    this.isProfileMenuOpen = !this.isProfileMenuOpen;
    this.isNotificationMenuOpen = false;
  }

  protected toggleNotificationMenu(): void {
    this.isNotificationMenuOpen = !this.isNotificationMenuOpen;
    this.isProfileMenuOpen = false;
    if (this.isNotificationMenuOpen) {
      this.notificationService.refreshRecent();
    }
  }

  protected getNotificationIcon(type: NotificationType): string {
    switch (type) {
      case 'TASK_ASSIGNED':
        return 'assignment_ind';
      case 'STATUS_CHANGE':
        return 'swap_horiz';
      case 'MENTION':
        return 'alternate_email';
      case 'DUE_DATE_REMINDER':
        return 'schedule';
      case 'OVERDUE_ALERT':
        return 'warning';
      case 'SPRINT_EVENT':
        return 'flag';
      default:
        return 'notifications';
    }
  }

  protected formatRelativeTime(dateString?: string | null): string {
    if (!dateString) return '';
    const now = new Date();
    const date = new Date(dateString);
    const diffSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSeconds < 60) return 'Just now';
    const diffMinutes = Math.floor(diffSeconds / 60);
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  protected handleNotificationClick(item: NotificationDto): void {
    if (!item.isRead) {
      this.notificationService.markAsRead(item.id).subscribe();
    }
    this.isNotificationMenuOpen = false;

    if (item.relatedEntityType === 'TASK' && item.relatedEntityId) {
      this.router.navigate(['/tasks', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'CASE' && item.relatedEntityId) {
      this.router.navigate(['/cases', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'PROJECT' && item.relatedEntityId) {
      this.router.navigate(['/projects', item.relatedEntityId]);
    } else if (item.relatedEntityType === 'SUBTASK') {
      this.router.navigate(['/tasks']);
    } else {
      // Generic or untracked notifications: open the notifications page as reference
      this.router.navigate(['/notifications']);
    }
  }

  protected markAllNotificationsRead(event: MouseEvent): void {
    event.stopPropagation();
    this.notificationService.markAllAsRead().subscribe();
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
        this.toastService.success(`Case "${formData.title}" created successfully!`);
        this.closeTaskModal();
      },
      error: () => {
        this.toastService.error('Failed to create case. Please try again.');
      },
    });
  }
}