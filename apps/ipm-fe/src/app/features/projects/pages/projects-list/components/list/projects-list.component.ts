import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import type { ProjectItem } from '../../../../services/projects.service';

@Component({
  standalone: true,
  selector: 'projects-list',
  imports: [CommonModule, FormsModule],
  templateUrl: './projects-list.component.html',
  styleUrl: './projects-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProjectsListComponent {
  @Input() projects: ProjectItem[] | null = null;
  @Output() newProjectClick = new EventEmitter<void>();
  @Output() searchChange = new EventEmitter<string>();
  @Output() deleteProject = new EventEmitter<string>();

  private router = inject(Router);

  searchQuery = '';
  selectedStatus: 'all' | 'Open' | 'Closed' = 'all';

  filteredProjects(): ProjectItem[] {
    if (!this.projects) return [];

    return this.projects.filter((project) => {
      const matchesStatus =
        this.selectedStatus === 'all' || project.status === this.selectedStatus;
      const matchesSearch =
        !this.searchQuery ||
        project.name.toLowerCase().includes(this.searchQuery.toLowerCase()) ||
        project.owner.toLowerCase().includes(this.searchQuery.toLowerCase());

      return matchesStatus && matchesSearch;
    });
  }

  getOpenCount(): number {
    return this.projects?.filter((p) => p.status === 'Open').length || 0;
  }

  getClosedCount(): number {
    return this.projects?.filter((p) => p.status === 'Closed').length || 0;
  }

  onNewProject(): void {
    this.newProjectClick.emit();
  }

  onSearchChange(): void {
    this.searchChange.emit(this.searchQuery);
  }

  onStatusChange(status: 'all' | 'Open' | 'Closed'): void {
    this.selectedStatus = status;
  }

  onDeleteProject(projectId: string): void {
    if (confirm('Are you sure you want to delete this project?')) {
      this.deleteProject.emit(projectId);
    }
  }

  onProjectClick(projectId: string, event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.col-actions')) {
      return;
    }
    this.router.navigate(['/projects', projectId]);
  }

  getStatusIcon(status: 'Open' | 'Closed'): string {
    return status === 'Open' ? 'check_circle' : 'cancel';
  }

  getStatusClass(status: 'Open' | 'Closed'): string {
    return status === 'Open' ? 'status-open' : 'status-closed';
  }
}
