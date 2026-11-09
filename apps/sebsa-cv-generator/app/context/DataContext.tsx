'use client';

import { pickEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';

import React, { createContext, useContext, useState, useCallback } from 'react';
import type { CvProfile } from '@/lib/cvTypes';

/**
 * UI-only state (per docs/02-architecture.md §4). Employee/CV business data now comes from
 * Server Components + Supabase — see services/employee-service.ts and repositories/. "Activity"
 * used to live here too (a fake, client-only, in-memory feed) — it's been replaced by real
 * DB-backed notifications (docs/04-rbac-security.md §17, services/notification-service.ts).
 *
 * addEmployee() is exposed here so the upload page client component can trigger the server action
 * via a thin wrapper without importing server-only modules.
 */

export interface CompanySettings {
  name: string;
  industry: string;
  colors: string[];
  activeTemplate: string;
}

/** The data passed to addEmployee from the upload form */
export interface NewEmployeePayload extends EmployeeDetails {
  /** Flat fields required for the Supabase profiles row */
  name: string;
  email: string;
  role: string;
  department: string;
  skills: string[];
  /** Structured CV data extracted by Gemini */
  cvProfile: CvProfile;
  /** Public URL of the uploaded profile picture (from profile-pictures bucket) */
  avatarUrl?: string;
}

interface DataContextType {
  companySettings: CompanySettings;
  updateCompanySettings: (settings: Partial<CompanySettings>) => void;
  /**
   * Persists a new employee to Supabase via the upload/actions.ts server action.
   * Returns the new profile's row ID and whether an account-invite email was sent.
   */
  addEmployee: (payload: NewEmployeePayload) => Promise<{ rowId: string; accountInvited: boolean }>;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [companySettings, setCompanySettings] = useState<CompanySettings>({
    name: 'Global HR Solutions',
    industry: 'Technology & HR',
    colors: ['#003d9b', '#486176'],
    activeTemplate: 'Executive Modern',
  });

  const updateCompanySettings = (settings: Partial<CompanySettings>) => {
    setCompanySettings((prev) => ({ ...prev, ...settings }));
  };

  /**
   * Calls the server action to persist the new employee. Dynamically imported to avoid bundling
   * server-only modules in the client bundle.
   */
  const addEmployee = useCallback(async (payload: NewEmployeePayload): Promise<{ rowId: string; accountInvited: boolean }> => {
    // Dynamically import the server action to avoid bundling 'use server' code in the client chunk
    const { createEmployeeAction } = await import('@/app/(authenticated)/upload/actions');

    const skillsFromExperience = payload.cvProfile.experience
      .flatMap((e) => e.tasks)
      .slice(0, 0); // tasks are not skills; keep skills list from form

    const { rowId, accountInvited } = await createEmployeeAction({
      ...pickEmployeeDetails(payload),
      name: payload.name,
      email: payload.email,
      role: payload.role,
      department: payload.department,
      skills: payload.skills.length > 0 ? payload.skills : skillsFromExperience,
      currentPosition: payload.cvProfile.currentPosition,
      summary: payload.cvProfile.summary,
      cvExperience: payload.cvProfile.experience,
      cvAcademic: payload.cvProfile.academic,
      specialProjects: payload.cvProfile.specialProjects,
      cvCertifications: payload.cvProfile.certifications,
      avatarUrl: payload.avatarUrl,
    });

    return { rowId, accountInvited };
  }, []);

  return (
    <DataContext.Provider
      value={{
        companySettings,
        updateCompanySettings,
        addEmployee,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
