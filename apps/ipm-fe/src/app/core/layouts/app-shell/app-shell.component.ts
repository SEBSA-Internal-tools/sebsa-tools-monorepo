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

  private readonly navigationItems: NavItem[] = [
    { label: 'Dashboard', icon: 'home', path: '/dashboard' },
    { label: 'Assigned Tasks', icon: 'search', path: '/tasks' },
    { label: 'Projects', icon: 'favorite', path: '/projects' },
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
    this.manuallyToggledGroups.set(group.label, !this.isGroupExpanded(group));
  }

  private readonly manuallyToggledGroups = new Map<string, boolean>();

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