import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ConfigScope, SubtaskType } from '@sebsa-pm-tool/shared-models';
import { ConfigOptionsService } from './config-options.service';

/** Subtask types read from the shared configuration table, mapped to the
 * `{ id, name }` shape the subtask screens expect. */
@Injectable({ providedIn: 'root' })
export class SubtaskTypesService {
  private readonly configOptions = inject(ConfigOptionsService);

  list(scope: ConfigScope = 'GLOBAL'): Observable<SubtaskType[]> {
    return this.configOptions.list(scope, { kind: 'SUBTASK_TYPE' }).pipe(
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
}
