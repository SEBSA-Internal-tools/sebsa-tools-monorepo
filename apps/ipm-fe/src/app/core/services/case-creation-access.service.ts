import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectsService } from '../../features/projects/services/projects.service';
import type { ProjectSummary } from '@sebsa-pm-tool/shared-models';

/**
 * Which projects the current user may create cases in. Entry points that are
 * not tied to one project (sidebar "New Case", calendar, CSO tabs) read this
 * to hide themselves when there is nowhere the user could create a case, so
 * they never open a form the API would refuse.
 */
@Injectable({ providedIn: 'root' })
export class CaseCreationAccessService {
  private readonly projectsService = inject(ProjectsService);
  private readonly _projects = signal<ProjectSummary[]>([]);
  private loaded = false;

  /** Any project where the user may create a case. */
  readonly canCreateAny = computed(() => this._projects().some((p) => p.permissions.canCreateCase));
  /** Any CSO project where the user may create a case. */
  readonly canCreateCso = computed(() =>
    this._projects().some((p) => p.isCsoProject && p.permissions.canCreateCase),
  );

  /** Idempotent; safe to call from every consumer's constructor. */
  ensureLoaded(): void {
    if (this.loaded) return;
    this.loaded = true;
    this.projectsService.getProjects().subscribe({
      next: (projects) => this._projects.set(projects),
      error: () => {
        this.loaded = false;
        this._projects.set([]);
      },
    });
  }
}
