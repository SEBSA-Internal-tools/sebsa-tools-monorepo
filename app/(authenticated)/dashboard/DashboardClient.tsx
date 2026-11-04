'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import { NotificationList } from '../../components/NotificationList';
import { markNotificationReadAction } from '../notifications/actions';
import type { AppNotification } from '@/services/notification-service';
import type { AuditLogRecord } from '@/services/audit-service';
import {
  Users,
  Sparkles,
  History,
  ArrowRight,
} from 'lucide-react';

interface DashboardClientProps {
  employeeCount: number;
  generatedCvCount: number;
  initialNotifications: AppNotification[];
  recentAuditLogs: AuditLogRecord[];
}

export default function DashboardClient({ employeeCount, generatedCvCount, initialNotifications, recentAuditLogs }: DashboardClientProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState(initialNotifications);

  const handleItemClick = async (n: AppNotification) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      markNotificationReadAction(n.id).catch((err) => console.error('Failed to mark notification read:', err));
    }
    if (n.link) router.push(n.link);
  };

  // Dynamic statistics calculations
  const totalEmployeesCount = employeeCount;

  const kpis = [
    {
      title: 'Total Employees',
      value: totalEmployeesCount.toLocaleString(),
      icon: Users,
      gradient: 'from-purple-800 via-violet-900 to-slate-950',
      iconBg: 'bg-white/15',
      iconColor: 'text-purple-200',
      labelColor: 'text-violet-200',
    },
    {
      title: 'Generated CV count',
      value: generatedCvCount.toLocaleString(),
      icon: Sparkles,
      gradient: 'from-indigo-900 to-slate-950',
      iconBg: 'bg-white/10',
      iconColor: 'text-sky-300',
      labelColor: 'text-indigo-300',
    },
  ];

  return (
    <PageWrapper className="p-8">
      {/* Hero Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
            Intelligence Dashboard
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Welcome back! Here's a snapshot of users, generated CVs, and key system metrics.
          </p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 mb-8">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <div
              key={idx}
              className={`bg-gradient-to-br ${kpi.gradient} text-white p-5 rounded-2xl shadow-xl relative overflow-hidden group border border-slate-800 hover:shadow-2xl hover:scale-[1.02] hover:-translate-y-0.5 transition-all duration-300 cursor-pointer`}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`p-3 ${kpi.iconBg} rounded-xl animate-pulse`}>
                  <Icon className={`w-5 h-5 ${kpi.iconColor} animate-pulse`} />
                </div>
              </div>
              <p className={`text-xs font-bold ${kpi.labelColor} uppercase tracking-widest mb-1.5`}>
                {kpi.title}
              </p>
              <h3 className="text-3xl font-black text-white tracking-tight font-sans">
                {kpi.value}
              </h3>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h4 className="text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2"><History className="w-4 h-4 text-indigo-600" />Recent Activities</h4>
              <button type="button" onClick={() => router.push('/activity?tab=activity')} className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide cursor-pointer">
                <span>View Full Activity Log</span><ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {recentAuditLogs.map((row) => <div key={row.id} className="flex items-start justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
                <div><p className="text-xs font-black text-slate-800">{row.action} <span className="font-semibold text-slate-500">{row.entityType ?? 'record'}</span></p><p className="text-[10px] font-semibold text-slate-400 mt-1">{row.actorName}</p></div>
                <span className="text-[10px] text-slate-400 whitespace-nowrap">{new Date(row.createdAt).toLocaleString()}</span>
              </div>)}
              {recentAuditLogs.length === 0 && <p className="text-xs text-slate-400 text-center py-10">No recent activities.</p>}
            </div>
          </div>
        </div>
        <div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm h-full flex flex-col">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
              <h4 className="font-sans text-sm font-black uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-600" />
                <span>Recent Notifications</span>
              </h4>
              <button
                type="button"
                onClick={() => router.push('/activity?tab=notifications')}
                className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 hover:text-indigo-700 uppercase tracking-wide transition-colors cursor-pointer"
              >
                <span>View Full Notification Log</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1">
              <NotificationList notifications={notifications} onItemClick={handleItemClick} />
            </div>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
