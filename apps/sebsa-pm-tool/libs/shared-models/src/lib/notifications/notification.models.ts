export type NotificationType =
  | 'TASK_ASSIGNED'
  | 'STATUS_CHANGE'
  | 'MENTION'
  | 'DUE_DATE_REMINDER'
  | 'OVERDUE_ALERT'
  | 'SPRINT_EVENT';

export type NotificationEntityType =
  | 'PROJECT'
  | 'CASE'
  | 'TASK'
  | 'SUBTASK'
  | 'COMMENT'
  | 'SPRINT'
  | 'MILESTONE'
  | 'USER'
  | 'PROJECT_MEMBER';

export interface NotificationDto {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedEntityType?: NotificationEntityType | null;
  relatedEntityId?: string | null;
  isRead: boolean;
  readAt?: string | null;
  createdAt: string;
}

export interface NotificationListResponse {
  data: NotificationDto[];
  total: number;
  unreadCount: number;
}

export interface UnreadCountResponse {
  count: number;
}

export interface NotificationCountsDto {
  all: number;
  unread: number;
  assignments: number;
  statusUpdates: number;
  deadlines: number;
}

export interface NotificationFilterParams {
  isRead?: boolean;
  type?: NotificationType;
  category?: 'ALL' | 'UNREAD' | 'ASSIGNMENTS' | 'STATUS_CHANGE' | 'DEADLINES';
  limit?: number;
  offset?: number;
}

