import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ActivityLogPage,
  AuditLogFilterOptions,
  ActivityAction,
  ActivityEntityType,
} from '@sebsa-pm-tool/shared-models';

/** Route segment for each entity type the scoped feed supports. */
const FEED_PATHS: Partial<Record<ActivityEntityType, string>> = {
  PROJECT: 'projects',
  CASE: 'cases',
  TASK: 'tasks',
  SUBTASK: 'subtasks',
};

export interface ActivityFeedQuery {
  action?: ActivityAction;
  actorId?: string;
  page?: number;
  limit?: number;
}

export interface AuditLogQuery extends ActivityFeedQuery {
  entityType?: ActivityEntityType;
  entityId?: string;
  projectId?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
}

@Injectable({ providedIn: 'root' })
export class ActivityLogsService {
  private readonly http = inject(HttpClient);

  /** Activity for one work item and everything beneath it. */
  getFeed(
    entityType: ActivityEntityType,
    entityId: string,
    query: ActivityFeedQuery = {},
  ): Observable<ActivityLogPage> {
    const path = FEED_PATHS[entityType];
    if (!path) {
      throw new Error(`No activity feed is available for ${entityType}.`);
    }

    return this.http.get<ActivityLogPage>(`/api/activity-logs/${path}/${entityId}`, {
      params: this.toParams(query),
    });
  }

  /** System-wide audit trail. Super Admin only — the API rejects everyone else. */
  getAuditLogs(query: AuditLogQuery = {}): Observable<ActivityLogPage> {
    return this.http.get<ActivityLogPage>('/api/audit-logs', { params: this.toParams(query) });
  }

  getAuditFilterOptions(): Observable<AuditLogFilterOptions> {
    return this.http.get<AuditLogFilterOptions>('/api/audit-logs/filters');
  }

  /** Drops empty values so a blank filter field doesn't narrow the query. */
  private toParams(query: ActivityFeedQuery | AuditLogQuery): HttpParams {
    return Object.entries(query).reduce((params, [key, value]) => {
      if (value === undefined || value === null || value === '') {
        return params;
      }
      return params.set(key, String(value));
    }, new HttpParams());
  }
}
