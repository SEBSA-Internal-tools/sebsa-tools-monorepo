import { CommonModule } from '@angular/common';
import { Component, HostListener, inject, OnInit } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { ThemeService } from '../../services/theme.service';
import { AuthService } from '../../services/auth.service';
import { ToastComponent } from '../../components/toast/toast.component';
import { CreateCaseModalComponent, type CaseFormData } from '../../../features/cases/create-case/create-case-modal.component';
import { CasesService } from '../../services/cases.service';
import { ToastService } from '../../services/toast.service';
import { NotificationService } from '../../services/notification.service';
import { UserAvatarComponent } from '../../components/user-avatar/user-avatar.component';
import type { CreateCaseRequest, NotificationDto, NotificationType, SystemRole } from '@sebsa-pm-tool/shared-models';

const SIDEBAR_COLLAPSED_KEY = 'ipm-fe.sidebar.collapsed';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  hiddenForRoles?: SystemRole[];
  onlyForRoles?: SystemRole[];
}

interface NavGroup {
  label: string;
  icon: string;
  children: NavItem[];
}

@Component({
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet, ToastComponent, CreateCaseModalComponent, UserAvatarComponent],
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

  private readonly navigationItems: NavItem[] = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'Assigned Works', icon: 'assignment_ind', path: '/tasks' },
    { label: 'Projects', icon: 'folder_open', path: '/projects' },
    { label: 'Customers', icon: 'domain', path: '/customers', hiddenForRoles: ['REGULAR_USER'] },
    { label: 'CSO', icon: 'groups', path: '/cso' },
    { label: 'Calendar', icon: 'calendar_month', path: '/calendar' },
  ];

  /** Administrative destinations, collapsed under one parent so they don't
   * crowd the day-to-day navigation for the users who can see them. */
  private readonly navigationGroups: NavGroup[] = [
    {
      label: 'System',
      icon: 'settings_applications',
      children: [
        {
          label: 'Admin',
          icon: 'admin_panel_settings',
          path: '/admin/users',
          onlyForRoles: ['ADMIN', 'SUPER_ADMIN'],
        },
        {
          label: 'Privilege Groups',
          icon: 'shield_person',
          path: '/admin/privilege-groups',
          onlyForRoles: ['SUPER_ADMIN'],
        },
        {
          label: 'Configuration',
          icon: 'tune',
          path: '/admin/configuration',
          onlyForRoles: ['SUPER_ADMIN'],
        },
        {
          label: 'Audit Log',
          icon: 'history',
          path: '/admin/audit-logs',
          onlyForRoles: ['SUPER_ADMIN'],
        },
      ],
    },
  ];

  /** Groups left empty by the role filter drop out entirely, so a regular user
   * never sees a "System" parent that opens onto nothing. */
  protected get visibleNavigationGroups(): NavGroup[] {
    return this.navigationGroups
      .map((group) => ({ ...group, children: group.children.filter((child) => this.isVisible(child)) }))
      .filter((group) => group.children.length > 0);
  }

  protected get visibleNavigationItems(): NavItem[] {
    return this.navigationItems.filter((item) => this.isVisible(item));
  }

  private isVisible(item: NavItem): boolean {
    const role = this.authService.currentUser()?.systemRole;

    // Without a resolved role yet, an `onlyForRoles` item stays hidden rather
    // than flashing into the sidebar before the session rehydrates.
    if (item.onlyForRoles) {
      return !!role && item.onlyForRoles.includes(role);
    }
    return !item.hiddenForRoles || !role || !item.hiddenForRoles.includes(role);
  }

  /** Open by default whenever one of its children is the current route; an
   * explicit click then wins over that until the user clicks again. */
  protected isGroupExpanded(group: NavGroup): boolean {
    return this.manuallyToggledGroups.get(group.label) ?? this.isGroupActive(group);
  }

  protected isGroupActive(group: NavGroup): boolean {
    return group.children.some((child) => this.router.url.startsWith(child.path));
  }

  protected toggleGroup(group: NavGroup): void {
    if (this.isSidebarCollapsed) {
      this.toggleSidebarCollapsed();
      this.manuallyToggledGroups.set(group.label, true);
      return;
    }
    this.manuallyToggledGroups.set(group.label, !this.isGroupExpanded(group));
  }

  private readonly manuallyToggledGroups = new Map<string, boolean>();

  protected isMobileSidebarOpen = false;
  protected isSidebarCollapsed = false;
  protected isTaskModalOpen = false;
  protected lastCreatedTask: CaseFormData | null = null;
  protected isProfileMenuOpen = false;
  protected isNotificationMenuOpen = false;

  ngOnInit(): void {
    try {
      this.isSidebarCollapsed = window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true';
    } catch {
      this.isSidebarCollapsed = false;
    }

    // Auto-close mobile drawer when user navigates
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe(() => {
        this.closeMobileSidebar();
      });
  }

  protected toggleSidebarCollapsed(): void {
    this.isSidebarCollapsed = !this.isSidebarCollapsed;
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(this.isSidebarCollapsed));
    } catch {
      // Private browsing or blocked storage: the preference just won't persist.
    }
  }

  protected toggleMobileSidebar(): void {
    this.isMobileSidebarOpen = !this.isMobileSidebarOpen;
  }

  protected openMobileSidebar(): void {
    this.isMobileSidebarOpen = true;
  }

  protected closeMobileSidebar(): void {
    this.isMobileSidebarOpen = false;
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
