import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ProjectHealthMatrix } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class ProjectHealthMatrixService {
  getProjectHealthMatrix(): Observable<ProjectHealthMatrix[]> {
    return of([]);
  }
}
