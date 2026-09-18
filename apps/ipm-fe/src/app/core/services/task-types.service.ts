import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfigScope, TaskComplexityLevel, TaskType } from '@sebsa-pm-tool/shared-models';
import { ConfigOptionsService } from './config-options.service';

/**
 * Task types now live in the shared configuration table. This keeps the older
 * `{ id, name }` shape the task screens expect, so callers do not need to know
 * they are reading config options.
 */
@Injectable({ providedIn: 'root' })
export class TaskTypesService {
  private readonly configOptions = inject(ConfigOptionsService);

  list(scope: ConfigScope = 'GLOBAL'): Observable<TaskType[]> {
    return this.configOptions.list(scope, { kind: 'TASK_TYPE' }).pipe(
      map((options) =>
        options.map((option) => ({
          id: option.id,
          name: option.label,
          description: null,
          order: option.order,
          isActive: option.isActive,
        })),
      ),
    );
  }

  /** Complexity levels are child entries of their task type. */
  listComplexityLevels(
    taskTypeId: string,
    scope: ConfigScope = 'GLOBAL',
  ): Observable<TaskComplexityLevel[]> {
    return this.configOptions
      .list(scope, { kind: 'COMPLEXITY_LEVEL', parentId: taskTypeId })
      .pipe(
        map((options) =>
          options.map((option) => ({
            id: option.id,
            taskTypeId,
            name: option.label,
            color: option.color,
            order: option.order,
          })),
        ),
      );
  }
}
