'use client';

import React, { useState, useMemo, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import type { Employee } from '@/types/domain';
import { isAdminOrAbove, isReviewerOrAbove, type UserRole } from '@/lib/roles';
import { deleteEmployeeAction } from './actions';
import AccountStatusControl from './AccountStatusControl';
import {
  Search,
  Filter,
  Plus,
  Users,
  Cpu,
  Eye,
  Trash2,
  ChevronLeft,
  ChevronRight,
  UserCircle,
} from 'lucide-react';

interface RepositoryClientProps {
  employees: Employee[];
  viewerRole: UserRole;
  departments: { id: string; name: string }[];
}

export default function RepositoryClient({ employees, viewerRole, departments }: RepositoryClientProps) {
  const router = useRouter();
  const [isDeleting, startDeleteTransition] = useTransition();
  // CV Reviewer can now create profiles too (docs/04-rbac-security.md §13), but editing/deleting
  // someone else's existing profile stays Admin/Super-Admin-only.
  const canCreateEmployees = isReviewerOrAbove(viewerRole);
  const canDeleteEmployees = isAdminOrAbove(viewerRole);
  // Inviting and deactivating are account-lifecycle actions, same tier as deleting a profile.
  const canManageAccounts = isAdminOrAbove(viewerRole);

  const deleteEmployee = (rowId: string) => {
    startDeleteTransition(async () => {
      await deleteEmployeeAction(rowId);
      router.refresh();
    });
  };

  // Search and Filtering State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All Departments');

  // Stats Calculations
  const stats = useMemo(() => {
    return {
      total: employees.length,
      aiSynced: '94%',
    };
  }, [employees]);

  // Dynamic Filtering Logic
  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) => {
      // 1. Search term match (Name, email, position)
      const matchesSearch =
        emp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.role.toLowerCase().includes(searchTerm.toLowerCase());

      // 2. Department match
      const matchesDept =
        selectedDept === 'All Departments' ||
        emp.department.toLowerCase() === selectedDept.toLowerCase();

      return matchesSearch && matchesDept;
    });
  }, [employees, searchTerm, selectedDept]);

  const handleClearFilters = () => {
    setSearchTerm('');
    setSelectedDept('All Departments');
  };

  const handleAddEmployee = () => {
    router.push('/upload');
  };

  const handleViewProfile = (rowId: string) => {
    router.push(`/repository/${rowId}`);
  };

  // Resolve avatar image
  const getAvatarSrc = (emp: Employee) => emp.avatar;

  return (
    <PageWrapper className="p-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
            Employee Profiles
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Manage, verify, and analyze your internal workforce talent pool with cognitive AI filters.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleClearFilters}
            className="flex items-center gap-2 px-5 py-2.5 bg-white border border-slate-200 text-slate-700 font-semibold rounded-full text-xs hover:bg-slate-50 transition-colors"
          >
            <Filter className="w-4 h-4" />
            <span>Clear Filters</span>
          </button>
          {canCreateEmployees && (
            <button
              onClick={handleAddEmployee}
              className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white font-sans text-xs font-black uppercase tracking-wider rounded-full shadow-lg shadow-indigo-600/10 hover:bg-indigo-700 transition-all active:scale-95"
            >
              <Plus className="w-4.5 h-4.5" />
              <span>Add Employee</span>
            </button>
          )}
        </div>
      </div>

      {/* Primary Table Module */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
        {/* Sub-Filters Action Bar */}
        <div className="p-6 border-b border-slate-100 flex flex-wrap gap-4 items-center bg-slate-50/50">
          <div className="flex-1 min-w-[200px] relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg text-xs py-2.5 pl-9 pr-4 focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 focus:outline-none"
            />
          </div>
          <div className="w-[180px]">
            <select
              value={selectedDept}
              onChange={(e) => setSelectedDept(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg text-xs py-2.5 px-3 focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 focus:outline-none"
            >
              <option value="All Departments">All Departments</option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.name}>{dept.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Dynamic Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider">Employee</th>
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider">Position</th>
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider">Department</th>
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider">Last Updated</th>
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider">Account</th>
                <th className="py-4 px-6 text-xs font-bold uppercase text-slate-500 tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredEmployees.length > 0 ? (
                filteredEmployees.map((emp) => (
                  <tr
                    key={emp.rowId}
                    className="hover:bg-slate-50/50 transition-colors group cursor-pointer"
                    onClick={() => handleViewProfile(emp.rowId)}
                  >
                    {/* User profile with headshot */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {emp.avatar && !emp.avatar.includes('unsplash.com') ? (
                          <img
                            src={getAvatarSrc(emp)}
                            alt={emp.name}
                            className="w-10 h-10 rounded-full border border-slate-200 object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                            <UserCircle className="w-6 h-6 text-slate-400" />
                          </div>
                        )}
                        <div>
                          <p className="font-sans text-xs font-black text-slate-800 leading-tight">
                            {emp.name}
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {emp.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Position */}
                    <td className="py-4 px-6 text-xs font-semibold text-slate-700">
                      {emp.role}
                    </td>

                    {/* Department badge */}
                    <td className="py-4 px-6">
                      <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border ${
                        emp.department === 'Engineering'
                          ? 'bg-sky-50 border-sky-100 text-sky-700'
                          : emp.department === 'Design'
                          ? 'bg-indigo-50 border-indigo-100 text-indigo-700'
                          : emp.department === 'Marketing'
                          ? 'bg-purple-50 border-purple-100 text-purple-700'
                          : 'bg-emerald-50 border-emerald-100 text-emerald-700'
                      }`}>
                        {emp.department}
                      </span>
                    </td>

                    {/* Last updated date */}
                    <td className="py-4 px-6 text-xs text-slate-500">
                      {emp.lastUpdated}
                    </td>

                    {/* Account lifecycle — clickable for Admin/Super Admin, read-only otherwise.
                        Stop propagation so opening the dialog doesn't also navigate to the profile. */}
                    <td className="py-4 px-6" onClick={(e) => e.stopPropagation()}>
                      <AccountStatusControl
                        rowId={emp.rowId}
                        employeeName={emp.name}
                        status={emp.accountStatus ?? 'inactive'}
                        canManage={canManageAccounts}
                      />
                    </td>

                    {/* Actions button strip (visible on hover) */}
                    <td className="py-4 px-6 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleViewProfile(emp.rowId)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                          title="View Profile"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canDeleteEmployees && (
                          <button
                            onClick={() => deleteEmployee(emp.rowId)}
                            disabled={isDeleting}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-40"
                            title="Remove Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <p className="text-sm font-medium text-slate-400">
                      No candidate profile records match your search criteria.
                    </p>
                    <button
                      onClick={handleClearFilters}
                      className="mt-3 text-xs font-black text-indigo-600 hover:underline"
                    >
                      Clear Search Filters
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination */}
        <div className="p-5 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
          <p className="text-xs font-semibold text-slate-400">
            Showing {filteredEmployees.length} of {employees.length} employees
          </p>
          <div className="flex items-center gap-1.5">
            <button className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-indigo-600 text-white font-bold text-xs shadow-sm">
              1
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all cursor-pointer">
              2
            </button>
            <span className="text-slate-400 text-xs px-1">...</span>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all cursor-pointer">
              312
            </button>
            <button className="w-8 h-8 rounded-lg flex items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-100 transition-all cursor-pointer">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}