import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  imports: [CommonModule],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPageComponent {
  protected readonly summaryCards = [
    {
      label: 'Active Projects',
      value: '12',
      change: '+2 this week',
      icon: 'folder_open',
    },
    {
      label: 'Open Tasks',
      value: '38',
      change: '9 due today',
      icon: 'task_alt',
    },
    {
      label: 'Blocked Items',
      value: '4',
      change: 'Needs attention',
      icon: 'warning',
    },
    {
      label: 'Delivery Health',
      value: '87%',
      change: 'On track overall',
      icon: 'monitor_heart',
    },
  ] as const;

  protected readonly portfolioCards = [
    {
      name: 'Website Revamp',
      owner: 'Design Team',
      status: 'In progress',
      statusTone: 'progress',
      progress: 68,
      due: '18 Jul',
    },
    {
      name: 'Mobile App Release',
      owner: 'Product Squad',
      status: 'At risk',
      statusTone: 'warning',
      progress: 42,
      due: '10 Jul',
    },
    {
      name: 'Client Onboarding',
      owner: 'Delivery',
      status: 'On track',
      statusTone: 'success',
      progress: 81,
      due: '24 Jul',
    },
  ] as const;

  protected readonly workload = [
    { name: 'Ava', role: 'PM', load: 78 },
    { name: 'Noah', role: 'Frontend', load: 64 },
    { name: 'Maya', role: 'Backend', load: 52 },
    { name: 'Liam', role: 'QA', load: 46 },
  ] as const;

  protected readonly milestones = [
    { title: 'Requirements sign-off', owner: 'Product', date: 'Today', complete: true },
    { title: 'Design handoff', owner: 'UX', date: 'Tomorrow', complete: true },
    { title: 'API freeze', owner: 'Engineering', date: '15 Jul', complete: false },
    { title: 'UAT start', owner: 'Delivery', date: '19 Jul', complete: false },
  ] as const;

  protected readonly activity = [
    { actor: 'Ava', action: 'updated', target: 'Website Revamp scope', time: '5m ago' },
    { actor: 'Maya', action: 'commented on', target: 'API freeze checklist', time: '23m ago' },
    { actor: 'Noah', action: 'moved', target: 'Login flow to In Review', time: '1h ago' },
    { actor: 'Product Board', action: 'approved', target: 'July release plan', time: '3h ago' },
  ] as const;
}