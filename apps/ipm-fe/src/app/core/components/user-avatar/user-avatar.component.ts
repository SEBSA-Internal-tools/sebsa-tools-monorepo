import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type UserAvatarSize = 'sm' | 'md' | 'lg' | 'xl';

/** Shows an uploaded profile picture when one exists, falling back to an
 * initials circle otherwise — the same fallback every avatar spot in the
 * app used to render by hand. */
@Component({
  standalone: true,
  selector: 'app-user-avatar',
  imports: [CommonModule],
  templateUrl: './user-avatar.component.html',
  styleUrl: './user-avatar.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserAvatarComponent {
  @Input() name = '';
  @Input() avatarUrl?: string | null;
  @Input() size: UserAvatarSize = 'md';

  get initials(): string {
    const trimmed = (this.name || '').trim();
    if (!trimmed) return 'U';
    const parts = trimmed.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return trimmed.slice(0, 2).toUpperCase();
  }
}
