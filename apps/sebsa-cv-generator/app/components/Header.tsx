'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { CurrentUser } from '@/lib/auth';
import { roleLabel } from '@/lib/roles';
import { NotificationList } from './NotificationList';
import {
  listNotificationsAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from '@/app/(authenticated)/notifications/actions';
import type { AppNotification } from '@/services/notification-service';
import { createClient } from '@/lib/supabase/client';
import { Search, Bell, UserCircle, Loader2, LogOut } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  user: CurrentUser;
  placeholder?: string;
  /** Callback for when the search value changes. */
  onSearchChange?: (val: string) => void;
  searchValue?: string;
  /** For pages with nothing to search (e.g. the assessments module) — avoids a dead input. */
  hideSearch?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  placeholder = 'Search employees, skills, or departments...',
  onSearchChange,
  searchValue = '',
  hideSearch = false,
}) => {
  const [showNotificationDropdown, setShowNotificationDropdown] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const router = useRouter();
  const notificationRef = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const loadNotifications = async () => {
    try {
      const list = await listNotificationsAction();
      setNotifications(list);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  // Close the dropdown on any click outside it, not just on a second bell click.
  useEffect(() => {
    if (!showNotificationDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(e.target as Node)) {
        setShowNotificationDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showNotificationDropdown]);

  const handleToggleDropdown = () => {
    const opening = !showNotificationDropdown;
    setShowNotificationDropdown(opening);
    if (opening) loadNotifications(); // refresh on open, not just once on page load
  };

  const handleItemClick = async (n: AppNotification) => {
    setShowNotificationDropdown(false);
    if (!n.isRead) {
      setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, isRead: true } : x)));
      markNotificationReadAction(n.id).catch((err) => console.error('Failed to mark notification read:', err));
    }
    if (n.link) router.push(n.link);
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    try {
      await markAllNotificationsReadAction();
    } catch (err) {
      console.error('Failed to mark all notifications read:', err);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error('Failed to sign out:', error);
      setSigningOut(false);
      return;
    }

    router.replace('/login');
    router.refresh();
  };

  return (
    <header className="fixed top-0 right-0 w-[calc(100%-260px)] h-16 bg-white/80 backdrop-blur-md border-b border-slate-200/80 flex items-center justify-between px-8 z-40">
      {/* Search Bar */}
      {hideSearch ? (
        <div className="flex-1" />
      ) : (
        <div className="flex-1 max-w-md">
          <div className="relative w-full group">
            <Search className="w-4 h-4 text-slate-400 absolute left-4.5 top-1/2 -translate-y-1/2 group-focus-within:text-slate-600 transition-colors" />
            <input
              type="text"
              placeholder={placeholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="w-full bg-slate-100/90 hover:bg-slate-200/50 border border-slate-200/50 rounded-full py-2 pl-11 pr-4 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all duration-300 placeholder:text-slate-400 font-sans text-slate-700"
            />
          </div>
        </div>
      )}

      {/* Action Utilities */}
      <div className="flex items-center gap-5">
        {/* Notifications Icon */}
        <div className="relative" ref={notificationRef}>
          <button
            onClick={handleToggleDropdown}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-all duration-300 relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>
            )}
          </button>

          {/* Quick Notifications Dropdown */}
          {showNotificationDropdown && (
            <div className="absolute right-0 mt-2.5 w-96 bg-white border border-slate-200 rounded-2xl shadow-xl shadow-slate-200/50 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Notifications</span>
                <div className="flex items-center gap-3">
                  {unreadCount > 0 && (
                    <button
                      onClick={handleMarkAllRead}
                      className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                    >
                      Mark all read
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setShowNotificationDropdown(false);
                      router.push('/activity');
                    }}
                    className="text-[11px] font-bold text-sky-600 hover:underline"
                  >
                    View All
                  </button>
                </div>
              </div>
              <div className="max-h-96 overflow-y-auto p-2">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  </div>
                ) : (
                  <NotificationList notifications={notifications} onItemClick={handleItemClick} />
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200"></div>

        {/* User Profile Info */}
        <div className="flex items-center gap-3">
          <div className="text-right hidden sm:block">
            <p className="font-sans text-xs font-black text-slate-800 leading-tight">
              {user.fullName}
            </p>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-none mt-0.5">
              {roleLabel(user.role)}
            </p>
          </div>
          <div
            onClick={() => router.push('/settings')}
            className="w-10 h-10 rounded-full border-2 border-slate-200 overflow-hidden shadow-sm cursor-pointer hover:border-slate-400 transition-colors duration-300 bg-slate-100 flex items-center justify-center shrink-0"
          >
            {user.avatarUrl && !user.avatarUrl.includes('unsplash.com') ? (
              <img src={user.avatarUrl} alt={user.fullName} className="w-full h-full object-cover" />
            ) : (
              <UserCircle className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            title="Sign out"
            aria-label="Sign out"
            className="p-2.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {signingOut ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <LogOut className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
