import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-notifications-page',
  template: `
    <section class="workspace-page">
      <div class="workspace-card">
        <p class="workspace-eyebrow">Updates</p>
        <h2>Notifications</h2>
        <p>Keep alerts, mentions, and system updates visible inside the unified shell.</p>
      </div>
    </section>
  `,
})
export class NotificationsPageComponent {}