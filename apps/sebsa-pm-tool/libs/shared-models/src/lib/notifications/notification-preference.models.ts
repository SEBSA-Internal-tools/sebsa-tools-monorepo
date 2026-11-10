import { NotificationType } from './notification.models';

export type NotificationChannel = 'IN_APP' | 'EMAIL' | 'SLACK' | 'TEAMS';

export interface NotificationPreferenceItem {
  channel: NotificationChannel;
  eventType: NotificationType;
  isEnabled: boolean;
}

export interface NotificationPreferencesMatrixDto {
  preferences: NotificationPreferenceItem[];
}

export interface UpdateNotificationPreferencesDto {
  preferences: {
    channel: NotificationChannel;
    eventType: NotificationType;
    isEnabled: boolean;
  }[];
}
