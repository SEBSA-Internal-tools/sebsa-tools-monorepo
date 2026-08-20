import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
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
        <span class="sebsa-eyebrow">SCHEDULING</span>
        <h1 class="sebsa-page-title">Calendar</h1>
        <p class="sebsa-page-desc">Plan meetings, deadlines, and release dates inside the same layout shell.</p>
      </header>
    </div>
  `,
})
export class CalendarPageComponent {}