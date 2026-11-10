import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Project } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class PortfolioService {
  getProjects(): Observable<Project[]> {
    return of([]);
  }
}
