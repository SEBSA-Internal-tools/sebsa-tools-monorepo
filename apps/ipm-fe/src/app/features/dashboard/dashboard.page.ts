import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-dashboard-page',
  template: `
    <section class="workspace-page">
      <div class="workspace-card">
        <p class="workspace-eyebrow">Overview</p>
        <h2>Dashboard</h2>
        <p>Track key project health, workload, and recent activity from a single place.</p>
      </div>
    </section>
  `,
})
export class DashboardPageComponent {}