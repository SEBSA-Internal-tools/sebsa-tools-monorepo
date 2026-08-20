import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-notifications-page',
  styles: [`
    :host {
      display: block;
      width: 100%;
      background-color: var(--surface-page);
    }
    .page-container {
      padding: 32px 40px;
      background-color: var(--surface-page);
      width: 100%;
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }
  `],
  template: `
    <div class="page-container">
      <header class="sebsa-page-header">
        <span class="sebsa-eyebrow">UPDATES</span>
        <h1 class="sebsa-page-title">Notifications</h1>
        <p class="sebsa-page-desc">Keep alerts, mentions, and system updates visible inside the unified shell.</p>
      </header>
    </div>
  `,
})
export class NotificationsPageComponent {}