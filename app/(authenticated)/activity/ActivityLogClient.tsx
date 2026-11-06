'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import { markNotificationReadAction, listNotificationsPageAction } from '../notifications/actions';
import { listAuditLogsPageAction } from '../audit-actions';
import { Pagination } from '@/app/components/Pagination';
import type { PaginatedResult } from '@/lib/pagination';
import type { AppNotification } from '@/services/notification-service';
import type { AuditLogRecord } from '@/services/audit-service';
import type { AuditChange } from '@/services/audit-service';
import { ArrowLeft, Bell, History } from 'lucide-react';

type LogTab = 'activity' | 'notifications';

interface ActivityLogClientProps {
  initialNotifications: PaginatedResult<AppNotification>;
  initialAuditLogs: PaginatedResult<AuditLogRecord>;
  initialTab: LogTab;
}

const cellCls = 'px-4 py-3 text-xs text-slate-600 align-top border-b border-slate-100';

const humanize = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

const displayValue = (value: unknown): string => {
  if (value == null || value === '') return '(none)';
  if (typeof value === 'string') return humanize(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
};

const isAuditChange = (value: unknown): value is AuditChange => {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return typeof item.field === 'string' && 'old_value' in item && 'new_value' in item;
};

function describeChanges(changes: AuditChange[]): string {
  return changes.map((change) => {
    const field = humanize(change.field);
    const complex = field === 'Summary'
      || typeof change.old_value === 'object'
      || typeof change.new_value === 'object';
    return complex
      ? `${field} updated`
      : `${field} changed from "${displayValue(change.old_value)}" to "${displayValue(change.new_value)}"`;
  }).join('; ');
}

function describeActivity(row: AuditLogRecord): string {
  const metadata = row.metadata;
  const operation = typeof metadata.operation === 'string' ? humanize(metadata.operation) : null;
  const rawChanges = metadata.changes;
  const hasStructuredChanges = Array.isArray(rawChanges);
  const changes = Array.isArray(rawChanges) ? rawChanges.filter(isAuditChange) : [];
  const targetName = typeof metadata.target_name === 'string' ? metadata.target_name : null;
  const fields = Array.isArray(metadata.changed_fields)
    ? metadata.changed_fields.map((field) => humanize(String(field))).join(', ')
    : null;

  if (changes.length > 0) {
    const details = describeChanges(changes);
    if (row.action === 'APPROVE' && metadata.operation === 'profile_change' && targetName) {
      return `${row.actorName} approved ${targetName}'s profile change request: ${details}.`;
    }
    if (metadata.operation === 'change_requested' && targetName) {
      return `Change requested by ${targetName}: ${details}.`;
    }
    if (row.entityType === 'user_role' && targetName) {
      const roleChange = changes[0];
      return `Changed ${targetName}'s role from "${displayValue(roleChange.old_value)}" to "${displayValue(roleChange.new_value)}".`;
    }
    return `${targetName ? `${targetName}: ` : ''}${details}.`;
  }
  if (row.action === 'UPDATE' && hasStructuredChanges) return 'No values changed.';
  if (operation && fields) return `${operation}. Changed: ${fields}.`;
  if (operation) return `${operation}.`;
  if (fields) return `Changed fields: ${fields}.`;
  if (row.action === 'DOWNLOAD') {
    const format = typeof metadata.format === 'string' ? metadata.format.toUpperCase() : 'CV';
    return `${metadata.anonymous ? 'Downloaded an anonymous' : 'Downloaded a'} ${format}.`;
  }
  if (typeof metadata.employee_email === 'string') return `Created the employee profile for ${metadata.employee_email}.`;
  if (typeof metadata.new_role === 'string') return `Changed the user role to ${humanize(metadata.new_role)}.`;
  if (Array.isArray(metadata.content_sections)) return `Saved customized CV sections: ${metadata.content_sections.map(String).map(humanize).join(', ')}.`;

  const entity = row.entityType ? humanize(row.entityType) : 'record';
  return `${humanize(row.action.toLowerCase())} ${entity}.`;
}

export default function ActivityLogClient({ initialNotifications, initialAuditLogs, initialTab }: ActivityLogClientProps) {
  const router = useRouter();
  const [tab, setTab] = useState<LogTab>(initialTab);
  const [notifications, setNotifications] = useState(initialNotifications.items);
  const [auditLogs, setAuditLogs] = useState(initialAuditLogs.items);
  const [notificationTotal, setNotificationTotal] = useState(initialNotifications.total);
  const [auditTotal, setAuditTotal] = useState(initialAuditLogs.total);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    const request = tab === 'activity' ? listAuditLogsPageAction(page, pageSize) : listNotificationsPageAction(page, pageSize);
    request.then((result) => {
      if (tab === 'activity') { const pageResult = result as PaginatedResult<AuditLogRecord>; setAuditLogs(pageResult.items); setAuditTotal(pageResult.total); }
      else { const pageResult = result as PaginatedResult<AppNotification>; setNotifications(pageResult.items); setNotificationTotal(pageResult.total); }
    }).finally(() => setLoading(false));
  }, [tab, page, pageSize]);

  const selectTab = (next: LogTab) => {
    setTab(next);
    setPage(1);
    router.replace(`/activity?tab=${next}`, { scroll: false });
  };

  const openNotification = async (notification: AppNotification) => {
    if (!notification.isRead) {
      setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, isRead: true } : row));
      await markNotificationReadAction(notification.id);
    }
    if (notification.link) router.push(notification.link);
  };

  return (
    <PageWrapper className="p-8">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider mb-6 cursor-pointer">
        <ArrowLeft className="w-4 h-4" /><span>Back</span>
      </button>

      <div className="mb-6">
        <h2 className="text-3xl font-black tracking-tight text-slate-900">Full Activity Log</h2>
        <p className="text-sm font-medium text-slate-500 mt-2">Review system audit events and notification history.</p>
      </div>

      <div className="flex gap-2 mb-5 border-b border-slate-200">
        <button type="button" onClick={() => selectTab('activity')} className={`flex items-center gap-2 px-4 py-3 text-xs font-black border-b-2 ${tab === 'activity' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
          <History className="w-4 h-4" /> Full Activity Log
        </button>
        <button type="button" onClick={() => selectTab('notifications')} className={`flex items-center gap-2 px-4 py-3 text-xs font-black border-b-2 ${tab === 'notifications' ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500'}`}>
          <Bell className="w-4 h-4" /> Full Notification Log
        </button>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-x-auto">
        {tab === 'activity' ? (
          <table className="w-full min-w-[900px] border-collapse text-left">
            <thead className="bg-slate-50"><tr>{['Time', 'User', 'Action', 'Activity'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>)}</tr></thead>
            <tbody>
              {auditLogs.map((row) => <tr key={row.id} className="hover:bg-slate-50/60">
                <td className={`${cellCls} whitespace-nowrap`}>{new Date(row.createdAt).toLocaleString()}</td>
                <td className={`${cellCls} font-bold text-slate-800`}>{row.actorName}</td>
                <td className={cellCls}><span className="rounded-full bg-indigo-50 px-2 py-1 font-black text-indigo-700">{row.action}</span></td>
                <td className={`${cellCls} max-w-xl leading-relaxed`}>{describeActivity(row)}</td>
              </tr>)}
              {auditLogs.length === 0 && <tr><td colSpan={4} className="p-10 text-center text-xs text-slate-400">No activity records available.</td></tr>}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[800px] border-collapse text-left">
            <thead className="bg-slate-50"><tr>{['Time', 'Type', 'Title', 'Message', 'Status'].map((label) => <th key={label} className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</th>)}</tr></thead>
            <tbody>
              {notifications.map((row) => <tr key={row.id} onClick={() => openNotification(row)} className="hover:bg-slate-50/60 cursor-pointer">
                <td className={`${cellCls} whitespace-nowrap`}>{new Date(row.createdAt).toLocaleString()}</td>
                <td className={cellCls}>{row.type.replaceAll('_', ' ')}</td>
                <td className={`${cellCls} font-bold text-slate-800`}>{row.title}</td>
                <td className={`${cellCls} max-w-md`}>{row.message}</td>
                <td className={cellCls}><span className={`rounded-full px-2 py-1 font-black ${row.isRead ? 'bg-slate-100 text-slate-500' : 'bg-indigo-50 text-indigo-700'}`}>{row.isRead ? 'Read' : 'Unread'}</span></td>
              </tr>)}
              {notifications.length === 0 && <tr><td colSpan={5} className="p-10 text-center text-xs text-slate-400">No notification records available.</td></tr>}
            </tbody>
          </table>
        )}
      </div>
      <Pagination page={page} pageSize={pageSize} total={tab === 'activity' ? auditTotal : notificationTotal} disabled={loading}
        onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
    </PageWrapper>
  );
}
