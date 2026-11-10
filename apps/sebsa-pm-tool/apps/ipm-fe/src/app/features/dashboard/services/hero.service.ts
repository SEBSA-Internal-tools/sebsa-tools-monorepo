import { Injectable } from '@angular/core';
import { Observable, of } from 'rxjs';
import { HeroData } from './dashboard.service';

@Injectable({ providedIn: 'root' })
export class HeroService {
  getHeroData(): Observable<HeroData | null> {
    return of(null);
  }
}
