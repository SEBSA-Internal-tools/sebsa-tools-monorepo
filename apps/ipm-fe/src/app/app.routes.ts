import { Route } from '@angular/router';
import { AppShellComponent } from './core/layouts/app-shell/app-shell.component';

export const appRoutes: Route[] = [
	{
		path: '',
		component: AppShellComponent,
		children: [
			{
				path: '',
				pathMatch: 'full',
				redirectTo: 'dashboard',
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
					import('./features/projects/projects.page').then((m) => m.ProjectsPageComponent),
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
