import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { ProjectsHeroData } from '../../services/projects.service';

@Component({
  standalone: true,
  selector: 'projects-hero',
  imports: [CommonModule],
  templateUrl: './projects-hero.component.html',
  styleUrl: './projects-hero.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsHeroComponent {
  @Input() data: ProjectsHeroData | null = null;
}
