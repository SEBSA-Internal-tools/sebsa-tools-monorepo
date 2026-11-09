import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ActivityLogEntry,
  AuditLogFilterOptions,
} from '@sebsa-pm-tool/shared-models';
import { ActivityLogsService, AuditLogQuery } from '../../../core/services/activity-logs.service';
import { ChangeListComponent } from '../../../core/components/change-list/change-list.component';
import { CustomSelectComponent } from '../../../core/components/custom-select/custom-select.component';
import { CustomDatepickerComponent } from '../../../core/components/custom-datepicker/custom-datepicker.component';

/** Blank strings rather than undefined so they bind straight to `<select>` and
 * `<input>` without a null-vs-empty mismatch on reset. */
interface AuditFilterForm {
  entityType: string;
  action: string;
  actorId: string;
  projectId: string;
  search: string;
  dateFrom: string;
  dateTo: string;
}

const EMPTY_FILTERS: AuditFilterForm = {
  entityType: '',
  action: '',
  actorId: '',
  projectId: '',
  search: '',
  dateFrom: '',
  dateTo: '',
};

/**
 * System-wide audit trail. The API restricts this data to Super Admin; the
 * route guard only keeps everyone else from loading a page that would fail.
 */
@Component({
  standalone: true,
  selector: 'app-audit-logs-page',
  imports: [
    CommonModule,
    FormsModule,
    ChangeListComponent,
    CustomSelectComponent,
    CustomDatepickerComponent,
  ],
  templateUrl: './audit-logs.page.html',
  styleUrl: './audit-logs.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogsPageComponent implements OnInit {
  private readonly activityLogs = inject(ActivityLogsService);

  protected readonly entries = signal<ActivityLogEntry[]>([]);
  protected readonly filterOptions = signal<AuditLogFilterOptions | null>(null);

  protected readonly entityTypeOptions = () =>
    (this.filterOptions()?.entityTypes ?? []).map((t) => ({ value: t, label: this.humanize(t) }));
  protected readonly actionOptions = () =>
    (this.filterOptions()?.actions ?? []).map((a) => ({ value: a, label: this.humanize(a) }));
  protected readonly actorOptions = () =>
    (this.filterOptions()?.actors ?? []).map((a) => ({ value: a.id, label: a.name }));
  protected readonly projectOptions = () =>
    (this.filterOptions()?.projects ?? []).map((p) => ({ value: p.id, label: p.name }));

  protected readonly isLoading = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly totalPages = signal(1);

  protected readonly limit = 50;
  protected filters: AuditFilterForm = { ...EMPTY_FILTERS };

  ngOnInit(): void {
    this.loadFilterOptions();
    this.load(1);
  }

  protected applyFilters(): void {
    this.load(1);
  }

  protected clearFilters(): void {
    this.filters = { ...EMPTY_FILTERS };
    this.load(1);
  }

  protected goToPage(page: number): void {
    if (page < 1 || page > this.totalPages() || page === this.page()) return;
    this.load(page);
  }

  protected get hasActiveFilters(): boolean {
    return Object.values(this.filters).some((value) => value !== '');
  }

  private load(page: number): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.activityLogs.getAuditLogs(this.buildQuery(page)).subscribe({
      next: (result) => {
        this.entries.set(result.entries);
        this.total.set(result.total);
        this.page.set(result.page);
        this.totalPages.set(result.totalPages);
        this.isLoading.set(false);
      },
      error: () => {
        this.errorMessage.set('Could not load the audit trail. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  /**
   * Date inputs give a bare `YYYY-MM-DD`, which the API reads as midnight. The
   * upper bound is pushed to the end of that day so "to 5 Sep" includes 5 Sep
   * rather than stopping before it starts.
   */
  private buildQuery(page: number): AuditLogQuery {
    return {
      ...(this.filters.entityType && { entityType: this.filters.entityType as never }),
      ...(this.filters.action && { action: this.filters.action as never }),
      ...(this.filters.actorId && { actorId: this.filters.actorId }),
      ...(this.filters.projectId && { projectId: this.filters.projectId }),
      ...(this.filters.search && { search: this.filters.search }),
      ...(this.filters.dateFrom && {
        dateFrom: new Date(`${this.filters.dateFrom}T00:00:00`).toISOString(),
      }),
      ...(this.filters.dateTo && {
        dateTo: new Date(`${this.filters.dateTo}T23:59:59.999`).toISOString(),
      }),
      page,
      limit: this.limit,
    };
  }

  private loadFilterOptions(): void {
    this.activityLogs.getAuditFilterOptions().subscribe({
      next: (options) => this.filterOptions.set(options),
      // A failure here costs the dropdowns their options but not the trail
      // itself, so the page stays usable with the free-text and date filters.
      error: () => this.filterOptions.set(null),
    });
  }

  protected formatTimestamp(isoDate: string): string {
    return new Date(isoDate).toLocaleString();
  }

  protected humanize(value: string): string {
    return value
      .toLowerCase()
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  protected trackById(_index: number, entry: ActivityLogEntry): string {
    return entry.id;
  }
}
