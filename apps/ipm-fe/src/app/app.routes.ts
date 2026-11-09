import { Route } from '@angular/router';
import { AppShellComponent } from './core/layouts/app-shell/app-shell.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';
import { unsavedChangesGuard } from './core/guards/unsaved-changes.guard';
import { staffGuard } from './core/guards/staff.guard';

export const appRoutes: Route[] = [
	{
		path: 'login',
		loadComponent: () =>
			import('./features/login/login.page').then((m) => m.LoginPageComponent),
	},
	{
		path: 'register',
		loadComponent: () =>
			import('./features/signup/signup.page').then((m) => m.SignupPageComponent),
	},
	{
		path: '',
		component: AppShellComponent,
		canActivate: [authGuard],
		children: [
			{
				path: '',
				pathMatch: 'full',
				redirectTo: '/dashboard',
			},
			{
				path: 'dashboard',
				loadComponent: () =>
					import('./features/dashboard/dashboard.page').then((m) => m.DashboardPageComponent),
			},
			{
				path: 'tasks',
				loadComponent: () =>
					import('./features/tasks/tasks.page').then((m) => m.TasksPageComponent),
			},
			{
				path: 'tasks/:id',
        canDeactivate: [unsavedChangesGuard],
				loadComponent: () =>
					import('./features/tasks/task-detail/task-detail.page').then((m) => m.TaskDetailPageComponent),
			},
			{
				path: 'cases/:id',
        canDeactivate: [unsavedChangesGuard],
				loadComponent: () =>
					import('./features/cases/case-detail/case-detail.page').then((m) => m.CaseDetailPageComponent),
			},
			{
				path: 'projects',
				loadComponent: () =>
					import('./features/projects/pages/projects-list/projects-list.page').then((m) => m.ProjectsPageComponent),
			},
			{
				path: 'customers',
				canActivate: [staffGuard],
				loadComponent: () =>
					import('./features/customers/pages/customers-list/customers-list.page').then((m) => m.CustomersPageComponent),
			},
			{
				path: 'customers/:id',
				canActivate: [staffGuard],
				loadComponent: () =>
					import('./features/customers/pages/customer-detail/customer-detail.page').then((m) => m.CustomerDetailPageComponent),
			},
			{
				path: 'projects/:id',
				loadComponent: () =>
					import('./features/projects/pages/project-detail/project-detail.page').then(
						(m) => m.ProjectDetailPageComponent
					),
			},
			{
				path: 'calendar',
				loadComponent: () =>
					import('./features/calendar/calendar.page').then((m) => m.CalendarPageComponent),
			},
			{
				path: 'notifications',
				loadComponent: () =>
					import('./features/notifications/notifications.page').then((m) => m.NotificationsPageComponent),
			},
			{
				path: 'admin/users',
				canActivate: [adminGuard],
				loadComponent: () =>
					import('./features/admin/users/admin-users.page').then((m) => m.AdminUsersPageComponent),
			},
			{
				path: 'admin/departments',
				canActivate: [adminGuard],
				loadComponent: () =>
					import('./features/admin/departments/departments.page').then(
						(m) => m.DepartmentsPageComponent
					),
			},
			{
				path: 'activity/:entityType/:entityId',
				loadComponent: () =>
					import('./features/activity/activity-log.page').then((m) => m.ActivityLogPageComponent),
			},
			{
				path: 'admin/configuration',
				canActivate: [superAdminGuard],
				loadComponent: () =>
					import('./features/admin/configuration/configuration.page').then(
						(m) => m.ConfigurationPageComponent
					),
			},
			{
				path: 'admin/audit-logs',
				canActivate: [superAdminGuard],
				loadComponent: () =>
					import('./features/admin/audit-logs/audit-logs.page').then((m) => m.AuditLogsPageComponent),
			},
			{
				path: 'admin/privilege-groups',
				canActivate: [superAdminGuard],
				loadComponent: () =>
					import('./features/admin/privilege-groups/privilege-groups.page').then(
						(m) => m.PrivilegeGroupsPageComponent
					),
			},
			{
				path: 'cso',
				loadComponent: () =>
					import('./features/cso/cso.page').then(
						(m) => m.CsoPageComponent
					),
			},
			{
				path: 'settings',
				loadComponent: () =>
					import('./features/settings/settings.page').then(
						(m) => m.SettingsPageComponent
					),
			},
		],
	},
];
