import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ThemeService } from '../../services/theme.service';

@Component({
  imports: [CommonModule, RouterLink, RouterLinkActive, RouterOutlet],
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

  constructor(protected readonly themeService: ThemeService) {}

  protected toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}