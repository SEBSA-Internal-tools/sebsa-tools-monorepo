import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-notifications-page',
  template: `
    <section class="workspace-page">
      <header class="sebsa-page-header">
        <span class="sebsa-eyebrow">UPDATES</span>
        <h1 class="sebsa-page-title">Notifications</h1>
        <p class="sebsa-page-desc">Keep alerts, mentions, and system updates visible inside the unified shell.</p>
      </header>
    </section>
  `,
})
export class NotificationsPageComponent {}