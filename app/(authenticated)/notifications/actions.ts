'use server';

import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import {
  listNotifications,
  listNotificationsPage,
  markNotificationRead,
  markAllNotificationsRead,
  type AppNotification,
} from '@/services/notification-service';
import type { PaginatedResult } from '@/lib/pagination';

export async function listNotificationsAction(): Promise<AppNotification[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const supabase = await createClient();
  return listNotifications(supabase, 8);
}

export async function listNotificationsPageAction(page: number, pageSize: number): Promise<PaginatedResult<AppNotification>> {
  const user = await getCurrentUser();
  if (!user) return { items: [], total: 0, page: 1, pageSize: 20 };
  return listNotificationsPage(await createClient(), page, pageSize);
}

export async function markNotificationReadAction(id: string): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  const supabase = await createClient();
  await markNotificationRead(supabase, id);
}

export async function markAllNotificationsReadAction(): Promise<void> {
  const user = await getCurrentUser();
  if (!user) throw new Error('Not authenticated.');
  const supabase = await createClient();
  await markAllNotificationsRead(supabase, user.id);
}
