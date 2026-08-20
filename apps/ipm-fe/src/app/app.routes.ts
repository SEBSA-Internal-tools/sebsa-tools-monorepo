import { Route } from '@angular/router';
import { AppShellComponent } from './core/layouts/app-shell/app-shell.component';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { superAdminGuard } from './core/guards/super-admin.guard';

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
				redirectTo: '/login',
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
				loadComponent: () =>
					import('./features/tasks/task-detail/task-detail.page').then((m) => m.TaskDetailPageComponent),
			},
			{
				path: 'projects',
				loadComponent: () =>
					import('./features/projects/pages/projects-list/projects-list.page').then((m) => m.ProjectsPageComponent),
			},
			{
				path: 'customers',
				loadComponent: () =>
					import('./features/customers/pages/customers-list/customers-list.page').then((m) => m.CustomersPageComponent),
			},
			{
				path: 'customers/:id',
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
		],
	},
];
