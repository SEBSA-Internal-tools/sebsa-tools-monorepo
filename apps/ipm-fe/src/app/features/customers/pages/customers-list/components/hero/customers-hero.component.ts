import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  standalone: true,
  selector: 'customers-hero',
  imports: [CommonModule],
  templateUrl: './customers-hero.component.html',
  styleUrl: './customers-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CustomersHeroComponent {}
