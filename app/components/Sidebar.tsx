'use client';

import React from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { CurrentUser } from '@/lib/auth';
import { isAdminOrAbove, isReviewerOrAbove, canManageAssessments } from '@/lib/roles';
import {
  LayoutDashboard,
  FolderOpen,
  CloudUpload,
  BrainCircuit,
  Settings,
  Sparkles,
  Users,
  User,
  ClipboardCheck,
  LogOut,
  UserCircle,
  Download,
  PenLine,
  GraduationCap,
  Award,
  BarChart3,
  CalendarRange,
  LibraryBig
} from 'lucide-react';

interface SidebarProps {
  user: CurrentUser;
}

export const Sidebar: React.FC<SidebarProps> = ({ user }) => {
  const pathname = usePathname() || '';
  const router = useRouter();

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  // Nav visibility follows the permission matrix (docs/04-rbac-security.md §2/§10): Employee only
  // ever has their own profile; CV Reviewer can view profiles, create profiles, manage CV
  // templates, and review pending approvals, but can't edit others' profiles or generate CVs;
  // Admin/Super Admin keep the full set.
  const navItems = user.role === 'employee'
    ? [
        { name: 'My Profile', path: `/repository/${user.profileId}`, icon: User },
        { name: 'Update Profile', path: '/my-profile', icon: PenLine },
        { name: 'Download CV', path: '/download-cv', icon: Download },
      ]
    : [
        ...(isAdminOrAbove(user.role) ? [{ name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }] : []),
        { name: 'Employee Profiles', path: '/repository', icon: FolderOpen },
        ...(isReviewerOrAbove(user.role) ? [{ name: 'Create Profile', path: '/upload', icon: CloudUpload }] : []),
        ...(isAdminOrAbove(user.role)
          ? [
              { name: 'Update Profile', path: '/update-profile', icon: Users },
              { name: 'Customize CVs', path: '/generate', icon: BrainCircuit },
            ]
          : []),
        ...(isReviewerOrAbove(user.role) ? [{ name: 'Pending Approvals', path: '/review', icon: ClipboardCheck }] : []),
      ];

  // Assessments are for everyone (all employees take them). The management screens are for the
  // HR tier (CV Reviewer, Super Admin) -- see canManageAssessments in lib/roles.ts.
  const assessmentItems = [
    { name: 'My Assessment', path: '/assessments', icon: GraduationCap, exact: true },
    { name: 'My Certificates', path: '/assessments/certificates', icon: Award, exact: false },
  ];

  const assessmentAdminItems = canManageAssessments(user.role)
    ? [
        { name: 'Assessment Tracker', path: '/assessments/manage', icon: BarChart3, exact: true },
        { name: 'Assessment Cycles', path: '/assessments/manage/cycles', icon: CalendarRange, exact: false },
        { name: 'Question Bank', path: '/assessments/manage/questions', icon: LibraryBig, exact: false },
      ]
    : [];

  const renderNavLink = (item: { name: string; path: string; icon: React.ElementType; exact?: boolean }) => {
    const isActive = item.exact ? pathname === item.path : pathname === item.path || pathname.startsWith(item.path + '/');
    const Icon = item.icon;
    return (
      <Link
        key={item.name}
        href={item.path}
        className={`flex items-center px-4 py-3 rounded-xl gap-3.5 transition-all duration-300 group ${
          isActive
            ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/10 border border-sky-500/30 text-sky-300 font-semibold'
            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
        }`}
      >
        <Icon
          className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${
            isActive ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'
          }`}
        />
        <span className="font-sans text-sm tracking-wide">{item.name}</span>
      </Link>
    );
  };

  const sectionLabel = (label: string) => (
    <p className="px-4 pt-2 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
  );

  return (
    <aside className="fixed left-0 top-0 h-full w-[260px] bg-slate-900 text-slate-100 flex flex-col p-5 border-r border-slate-800 z-50">
      {/* Brand Header */}
      <div className="flex items-center gap-3 mb-8 px-2">
        <div className="w-10 h-10 rounded-2xl flex items-center justify-center mb-4 hover:scale-105 transition-transform duration-300">
          <Image
            src="/images/seb-logo-2.png"
            alt="Sebsa CV Generator Logo"
            width={36}
            height={36}
            className="object-contain"
          />
        </div>
        <div>
          <h1 className="font-sans text-s font-black tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
            SEBSA Employee ManagementPortal
          </h1>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 flex flex-col gap-1.5">
        {sectionLabel('CV Generator')}
        {navItems.map(renderNavLink)}

        <div className="w-full h-px bg-slate-800/80 my-3" />
        {sectionLabel('Assessments')}
        {assessmentItems.map(renderNavLink)}
        {assessmentAdminItems.map(renderNavLink)}

        {isAdminOrAbove(user.role) && (
          <>
            <div className="w-full h-px bg-slate-800/80 my-4" />

            {/* Settings Item */}
            <Link
              href="/settings"
              className={`flex items-center px-4 py-3 rounded-xl gap-3.5 transition-all duration-300 group ${
                pathname === '/settings'
                  ? 'bg-gradient-to-r from-sky-500/20 to-indigo-500/10 border border-sky-500/30 text-sky-300 font-semibold'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/50'
              }`}
            >
              <Settings
                className={`w-5 h-5 transition-transform duration-300 group-hover:scale-110 ${
                  pathname === '/settings' ? 'text-sky-400' : 'text-slate-400 group-hover:text-slate-200'
                }`}
              />
              <span className="font-sans text-sm tracking-wide">Settings</span>
            </Link>
          </>
        )}
      </nav>

      {/* User Footer Profile */}
      <div className="flex items-center gap-3 mt-4 pt-4 border-t border-slate-800/80">
        <div className="relative">
          {user.avatarUrl && !user.avatarUrl.includes('unsplash.com') ? (
            <img
              src={user.avatarUrl}
              alt={user.fullName}
              className="w-10 h-10 rounded-full border border-slate-700 object-cover"
            />
          ) : (
            <div className="w-10 h-10 rounded-full border border-slate-700 bg-slate-800 flex items-center justify-center">
              <UserCircle className="w-6 h-6 text-slate-400" />
            </div>
          )}
          <span className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 rounded-full border border-slate-950"></span>
        </div>
        <div className="truncate flex-1">
          <p className="font-sans text-xs font-black text-slate-200 truncate leading-tight">
            {user.fullName}
          </p>
          <p className="text-[10px] text-slate-400 truncate mt-0.5 font-semibold uppercase tracking-wider">
            {user.role}
          </p>
        </div>
        <button
          onClick={handleSignOut}
          title="Sign out"
          className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/60 rounded-lg transition-colors shrink-0"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
