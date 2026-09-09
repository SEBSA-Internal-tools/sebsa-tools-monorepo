import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, of } from 'rxjs';
import {
  UserProfileDto,
  UpdateProfileDto,
  ChangePasswordDto,
} from '@sebsa-pm-tool/shared-models';

@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);

  getProfile(): Observable<UserProfileDto | null> {
    return this.http.get<UserProfileDto>('/api/users/profile').pipe(
      catchError(() => of(null)),
    );
  }

  updateProfile(dto: UpdateProfileDto): Observable<UserProfileDto> {
    return this.http.patch<UserProfileDto>('/api/users/profile', dto);
  }

  changePassword(dto: ChangePasswordDto): Observable<{ success: boolean; message: string }> {
    return this.http.post<{ success: boolean; message: string }>('/api/users/change-password', dto);
  }
}
