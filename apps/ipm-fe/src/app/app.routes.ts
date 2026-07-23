import { Route } from '@angular/router';
import { AppShellComponent } from './core/layouts/app-shell/app-shell.component';

export const appRoutes: Route[] = [
	{
		path: 'login',
		loadComponent: () =>
			import('./features/login/login.page').then((m) => m.LoginPageComponent),
	},
	{
		path: '',
		component: AppShellComponent,
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
				path: 'projects',
				loadComponent: () =>
					import('./features/projects/pages/projects-list/projects-list.page').then((m) => m.ProjectsPageComponent),
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
		],
	},
];
