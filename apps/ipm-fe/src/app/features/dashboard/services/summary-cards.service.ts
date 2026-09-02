import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { SummaryCard } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class SummaryCardsService {
  getSummaryCards(): Observable<SummaryCard[]> {
    return of([]);
  }
}
