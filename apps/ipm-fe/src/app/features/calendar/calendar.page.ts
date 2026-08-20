import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
  template: `
    <section class="workspace-page">
      <header class="sebsa-page-header">
        <span class="sebsa-eyebrow">SCHEDULING</span>
        <h1 class="sebsa-page-title">Calendar</h1>
        <p class="sebsa-page-desc">Plan meetings, deadlines, and release dates inside the same layout shell.</p>
      </header>
    </section>
  `,
})
export class CalendarPageComponent {}