'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useData } from '../../context/DataContext';
import { PageWrapper } from '../../components/PageWrapper';
import { createClient } from '@/lib/supabase/client';
import { isAdminOrAbove, canAssignRole, type UserRole } from '@/lib/roles';
import { listUsersPageAction, updateUserRoleAction, type ManagedUser } from './actions';
import { Pagination } from '@/app/components/Pagination';
import {
  Settings,
  Building2,
  LayoutGrid,
  Users2,
  Users,
  Save,
  CheckCircle2,
  Palette,
  ShieldAlert,
  Search,
  Loader2,
  UserCircle,
  Crown,
  ShieldCheck,
  Eye,
} from 'lucide-react';

const ASSIGNABLE_ROLES: UserRole[] = ['super_admin', 'admin', 'cv_reviewer', 'employee'];

const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  cv_reviewer: 'HR',
  employee: 'Employee',
};

export default function SettingsPage() {
  const router = useRouter();
  const { companySettings, updateCompanySettings } = useData();

  // Settings State
  const [compName, setCompName] = useState(companySettings.name);
  const [compIndustry, setCompIndustry] = useState(companySettings.industry);
  const [activeTmpl, setActiveTmpl] = useState(companySettings.activeTemplate);
  const [primaryColor, setPrimaryColor] = useState('#405169');

  const [isSaved, setIsSaved] = useState(false);

  // ── User Access & Team Controls (real data) ──────────────────────────────────
  const [currentUserRole, setCurrentUserRole] = useState<UserRole | null>(null);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<UserRole | 'all'>('all');
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(20);
  const [userTotal, setUserTotal] = useState(0);
  const [serverRoleCounts, setServerRoleCounts] = useState<Record<UserRole, number>>({ employee: 0, cv_reviewer: 0, admin: 0, super_admin: 0 });

  const loadUserAccess = useCallback(async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: roleRow } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      const viewerRole = (roleRow?.role as UserRole | undefined) ?? 'employee';
      setCurrentUserRole(viewerRole);

      // Settings is entirely an Admin/Super Admin surface (company config, templates picker,
      // user access) — docs/04-rbac-security.md §2. UX guard only; the User Access card's own
      // actions (listUsersAction/updateUserRoleAction) are the real boundary.
      if (!isAdminOrAbove(viewerRole)) {
        router.replace('/dashboard');
        return;
      }

      const result = await listUsersPageAction(userPage, userPageSize, userSearch, roleFilter);
      setUsers(result.items);
      setUserTotal(result.total);
      setServerRoleCounts(result.roleCounts);
    } catch (err) {
      console.error('Failed to load user access data:', err);
      setUsersError(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setUsersLoading(false);
    }
  }, [router, userPage, userPageSize, userSearch, roleFilter]);

  useEffect(() => {
    const timer = setTimeout(loadUserAccess, userSearch ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadUserAccess]);

  const handleRoleChange = async (targetUserId: string, newRole: UserRole) => {
    setSavingUserId(targetUserId);
    setUsersError(null);
    try {
      await updateUserRoleAction(targetUserId, newRole);
      await loadUserAccess();
    } catch (err) {
      console.error('Failed to update role:', err);
      setUsersError(err instanceof Error ? err.message : 'Failed to update role.');
    } finally {
      setSavingUserId(null);
    }
  };

  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    updateCompanySettings({
      name: compName,
      industry: compIndustry,
      activeTemplate: activeTmpl,
    });
    setIsSaved(true);
    setTimeout(() => {
      setIsSaved(false);
    }, 2000);
  };

  const filteredUsers = users;

  // Counted from the full roster, not filteredUsers — these tiles summarize everyone regardless
  // of the search/filter above.
  const roleCounts = serverRoleCounts;

  const roleKpis = [
    { label: 'Total Employees', value: Object.values(roleCounts).reduce((sum, count) => sum + count, 0), icon: Users, color: 'text-indigo-600 bg-indigo-50' },
    { label: 'Super Admins', value: roleCounts.super_admin, icon: Crown, color: 'text-amber-600 bg-amber-50' },
    { label: 'Admins', value: roleCounts.admin, icon: ShieldCheck, color: 'text-sky-600 bg-sky-50' },
    { label: 'HR', value: roleCounts.cv_reviewer, icon: Eye, color: 'text-emerald-600 bg-emerald-50' },
  ];

  const templatesList = [
    { name: 'Executive Modern', desc: 'High-contrast typography, ideal for leadership profiles.' },
    { name: 'Muted Minimalist', desc: 'Understated margins, elegant serif details for designers.' },
    { name: 'Swiss Clean Slate', desc: 'Highly structure grid system, tech-forward monospace font.' },
  ];

  return (
    <PageWrapper className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
          Portal Settings
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Configure company metrics, template specifications, and user access controls.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Left Column: Company & Template settings (Span 7) */}
        <div className="col-span-12 lg:col-span-7 flex flex-col gap-6">
          {/* User Access & Team Controls — real user_roles data */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Users2 className="w-5 h-5 text-indigo-600" />
              <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400">
                User Access & Team Controls
              </h4>
            </div>

            {!usersLoading && currentUserRole && isAdminOrAbove(currentUserRole) && users.length > 0 && (
              <div className="flex flex-wrap gap-2.5">
                <div className="flex-1 min-w-[160px] relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search by email..."
                    value={userSearch}
                    onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg text-[11px] py-2 pl-8 pr-3 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all"
                  />
                </div>
                <select
                  value={roleFilter}
                  onChange={(e) => { setRoleFilter(e.target.value as UserRole | 'all'); setUserPage(1); }}
                  className="bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold py-2 px-2.5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all shrink-0"
                >
                  <option value="all">All Roles</option>
                  {ASSIGNABLE_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {usersLoading && (
              <div className="flex items-center justify-center py-8 text-slate-400">
                <Loader2 className="w-5 h-5 animate-spin" />
              </div>
            )}

            {!usersLoading && currentUserRole && !isAdminOrAbove(currentUserRole) && (
              <p className="text-xs text-slate-400 py-4 text-center">
                Only Admin and Super Admin can view or manage user access.
              </p>
            )}

            {usersError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                {usersError}
              </p>
            )}

            {!usersLoading && currentUserRole && isAdminOrAbove(currentUserRole) && filteredUsers.length === 0 && (
              <p className="text-xs text-slate-400 py-4 text-center">
                {users.length === 0 ? 'No users found.' : 'No users match your search/filter.'}
              </p>
            )}

            {!usersLoading && currentUserRole && isAdminOrAbove(currentUserRole) && (
              <div className="space-y-3.5">
                {filteredUsers.map((usr) => {
                  const actorCanActOnRow = canAssignRole(currentUserRole, usr.role);
                  const assignableOptions = ASSIGNABLE_ROLES.filter((r) =>
                    canAssignRole(currentUserRole, r)
                  );
                  return (
                    <div
                      key={usr.id}
                      className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/50 gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {usr.avatarUrl ? (
                          <img
                            src={usr.avatarUrl}
                            alt={usr.name ?? usr.email}
                            className="w-9 h-9 rounded-full border border-slate-200 object-cover shrink-0"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                            <UserCircle className="w-5 h-5 text-slate-400" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <h5 className="text-[11px] font-black text-slate-800 leading-none truncate">
                            {usr.name ?? usr.email}
                          </h5>
                          {usr.name && (
                            <p className="text-[10px] text-slate-500 mt-1 truncate">{usr.email}</p>
                          )}
                          <p className="text-[9px] text-slate-400 mt-1 leading-none">
                            Joined {new Date(usr.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      {actorCanActOnRow ? (
                        <select
                          value={usr.role}
                          disabled={savingUserId === usr.id}
                          onChange={(e) => handleRoleChange(usr.id, e.target.value as UserRole)}
                          className="text-[10px] font-black uppercase tracking-wide text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50 shrink-0"
                        >
                          {assignableOptions.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABELS[r]}
                            </option>
                          ))}
                          {!assignableOptions.includes(usr.role) && (
                            <option value={usr.role}>{ROLE_LABELS[usr.role]}</option>
                          )}
                        </select>
                      ) : (
                        <span className="text-[9px] font-black uppercase tracking-wide text-slate-500 bg-slate-100 border border-slate-200 px-2 py-1 rounded-lg shrink-0">
                          {ROLE_LABELS[usr.role]}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {!usersLoading && currentUserRole && isAdminOrAbove(currentUserRole) && (
              <Pagination page={userPage} pageSize={userPageSize} total={userTotal}
                onPageChange={setUserPage}
                onPageSizeChange={(size) => { setUserPageSize(size); setUserPage(1); }} />
            )}
          </div>
        </div>

        {/* Right Column (Span 5) */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          {!usersLoading && currentUserRole && isAdminOrAbove(currentUserRole) && (
            <div className="grid grid-cols-2 gap-3.5">
              {roleKpis.map((kpi) => {
                const Icon = kpi.icon;
                return (
                  <div
                    key={kpi.label}
                    className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-2"
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${kpi.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 tracking-tight font-sans leading-none">
                      {kpi.value}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                      {kpi.label}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
