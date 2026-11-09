'use client';

import React from 'react';
import type { AppNotification } from '@/services/notification-service';
import type { NotificationType } from '@/lib/notifications';
import { formatRelativeTime } from '@/lib/formatRelativeTime';
import { CheckCircle2, XCircle, Clock, Bell } from 'lucide-react';

const TYPE_META: Record<NotificationType, { icon: React.ElementType; color: string }> = {
  new_profile_submitted: { icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  claim_requested: { icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  change_requested: { icon: Clock, color: 'text-amber-600 bg-amber-50 border-amber-100' },
  profile_approved: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  claim_approved: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  change_approved: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  account_provisioned: { icon: CheckCircle2, color: 'text-emerald-600 bg-emerald-50 border-emerald-100' },
  profile_rejected: { icon: XCircle, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  claim_rejected: { icon: XCircle, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  change_rejected: { icon: XCircle, color: 'text-rose-600 bg-rose-50 border-rose-100' },
  profile_updated: { icon: Bell, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
};
const DEFAULT_META = { icon: Bell, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' };

interface NotificationListProps {
  notifications: AppNotification[];
  onItemClick: (notification: AppNotification) => void;
  emptyLabel?: string;
}

/** Shared row rendering for the Header bell dropdown, the Dashboard preview, and the full
 *  /activity log page — all three just differ in how many notifications they pass in. */
export function NotificationList({ notifications, onItemClick, emptyLabel = 'No notifications yet.' }: NotificationListProps) {
  if (notifications.length === 0) {
    return <p className="text-xs font-medium text-slate-400 text-center py-10">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {notifications.map((n) => {
        const meta = TYPE_META[n.type] ?? DEFAULT_META;
        const Icon = meta.icon;
        return (
          <button
            key={n.id}
            type="button"
            onClick={() => onItemClick(n)}
            className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all duration-200 cursor-pointer group ${
              n.isRead
                ? 'bg-slate-50/50 hover:bg-slate-50 border-slate-100 hover:border-slate-200'
                : 'bg-indigo-50/40 hover:bg-indigo-50/70 border-indigo-100'
            }`}
          >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border shadow-sm ${meta.color}`}>
              <Icon className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h5 className={`text-xs leading-snug ${n.isRead ? 'font-bold text-slate-700' : 'font-black text-slate-900'}`}>
                  {n.title}
                </h5>
                <span className="text-[10px] font-semibold text-slate-400 shrink-0 mt-0.5">
                  {formatRelativeTime(n.createdAt)}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed mt-0.5">{n.message}</p>
            </div>
            {!n.isRead && <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-1.5" />}
          </button>
        );
      })}
    </div>
  );
}
