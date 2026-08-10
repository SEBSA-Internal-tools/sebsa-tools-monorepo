import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-tasks-page',
  template: `
    <section class="workspace-page">
      <div class="workspace-card">
        <p class="workspace-eyebrow">Work Queue</p>
        <h2>My Tasks</h2>
        <p>View assigned tasks, priorities, and due dates without leaving the app shell.</p>
      </div>
    </section>
  `,
})
export class TasksPageComponent {}