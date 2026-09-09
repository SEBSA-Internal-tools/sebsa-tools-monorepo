import { ChangeDetectionStrategy, Component, Input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivityFieldChange } from '@sebsa-pm-tool/shared-models';

/**
 * Renders the before/after pairs on an activity or audit entry.
 *
 * Long values — a rewritten description above all — collapse behind a toggle
 * rather than pushing a whole paragraph into a feed item or a table cell.
 * Shared by the activity feed and the audit log so both collapse identically.
 */
@Component({
  standalone: true,
  selector: 'app-change-list',
  imports: [CommonModule],
  templateUrl: './change-list.component.html',
  styleUrl: './change-list.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangeListComponent {
  @Input({ required: true }) changes: ActivityFieldChange[] = [];
  /** Values longer than this collapse behind a toggle. */
  @Input() maxLength = 60;

  private readonly expandedFields = signal<ReadonlySet<string>>(new Set<string>());

  protected isExpanded(field: string): boolean {
    return this.expandedFields().has(field);
  }

  /** One toggle per row expands both sides, so a before/after pair stays comparable. */
  protected toggle(field: string): void {
    this.expandedFields.update((current) => {
      const next = new Set(current);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  protected isCollapsible(change: ActivityFieldChange): boolean {
    return this.exceedsLimit(change.from) || this.exceedsLimit(change.to);
  }

  protected display(value: string | null, field: string): string {
    if (value === null || value === '') return '—';
    if (this.isExpanded(field) || !this.exceedsLimit(value)) return value;

    return `${value.slice(0, this.maxLength).trimEnd()}…`;
  }

  /** Field names are stored as they appear on the model; render them as words. */
  protected humanizeField(field: string): string {
    return field
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (char) => char.toUpperCase())
      .trim();
  }

  private exceedsLimit(value: string | null): boolean {
    return !!value && value.length > this.maxLength;
  }
}
