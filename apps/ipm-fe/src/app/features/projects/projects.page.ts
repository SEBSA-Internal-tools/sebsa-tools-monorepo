import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-projects-page',
  template: `
    <section class="workspace-page">
      <div class="workspace-card">
        <p class="workspace-eyebrow">Portfolio</p>
        <h2>Projects</h2>
        <p>Review delivery milestones, ownership, and project status in one workflow.</p>
      </div>
    </section>
  `,
})
export class ProjectsPageComponent {}