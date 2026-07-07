import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'app-calendar-page',
  template: `
    <section class="workspace-page">
      <div class="workspace-card">
        <p class="workspace-eyebrow">Scheduling</p>
        <h2>Calendar</h2>
        <p>Plan meetings, deadlines, and release dates inside the same layout shell.</p>
      </div>
    </section>
  `,
})
export class CalendarPageComponent {}