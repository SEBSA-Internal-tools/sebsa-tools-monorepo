'use client';

import React, { useState } from 'react';
import { User, Building2 } from 'lucide-react';
import type { CvExperienceEntry, CvAcademicEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { toUpperCaseText } from '@/lib/text';
import {
  SectionCard,
  ExperienceSection,
  ProjectsSection,
  EducationSection,
  CertificationsSection,
  inputCls,
  textareaCls,
} from '@/app/components/CvEntrySections';

export interface ProfileFieldsValue {
  name: string;
  role: string;
  department: string;
  /** Objective / professional summary — profiles.summary column. */
  summary: string;
  skills: string[];
  experience: CvExperienceEntry[];
  academic: CvAcademicEntry[];
  specialProjects: CvProjectEntry[];
  certifications: CvCertificationEntry[];
}

export function emptyProfileFieldsValue(defaults?: Partial<ProfileFieldsValue>): ProfileFieldsValue {
  return {
    name: '',
    role: '',
    department: '',
    summary: '',
    skills: [],
    experience: [],
    academic: [],
    specialProjects: [],
    certifications: [],
    ...defaults,
  };
}

interface ProfileFieldsEditorProps {
  value: ProfileFieldsValue;
  onChange: (updated: ProfileFieldsValue) => void;
  departments: { id: string; name: string }[];
  /** Employee self-edit (docs/04-rbac-security.md §10) locks name — mandatory field, not editable. */
  nameEditable?: boolean;
  profileOnly?: boolean;
}

/**
 * Shared structured profile form — used by app/onboarding (create-from-scratch, no CV to parse)
 * and app/(authenticated)/my-profile (detailed self-edit with separate overview/contact tabs).
 * Reuses the same entry-array editors as the Generate flow's CvSectionEditor.tsx
 * (app/components/CvEntrySections.tsx) since the underlying shapes are identical.
 */
export default function ProfileFieldsEditor({ value, onChange, departments, nameEditable = true, profileOnly = false }: ProfileFieldsEditorProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    basics: true,
    skills: true,
    experience: true,
    projects: false,
    education: false,
    certifications: false,
  });

  const toggle = (key: string) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  const patch = (partial: Partial<ProfileFieldsValue>) => onChange({ ...value, ...partial });

  return (
    <div className="space-y-4">
      {!profileOnly && <SectionCard label="Basics" icon={User} expanded={expanded.basics} onToggle={() => toggle('basics')}>
        {nameEditable && (
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Full Name</label>
            <input
              type="text"
              required
              value={value.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Jane Doe"
              className={inputCls}
            />
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Current Role</label>
            <input
              type="text"
              required
              value={value.role}
              onChange={(e) => patch({ role: toUpperCaseText(e.target.value) })}
              placeholder="e.g. Senior Software Engineer"
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">
              <Building2 className="w-3 h-3" /> Department
            </label>
            <select value={value.department} onChange={(e) => patch({ department: e.target.value })} className={inputCls}>
              {departments.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase block">Objective / Professional Summary</label>
          <textarea
            rows={3}
            value={value.summary}
            onChange={(e) => patch({ summary: e.target.value })}
            placeholder="A brief statement of your career goals and what you bring to the role..."
            className={textareaCls}
          />
        </div>
      </SectionCard>}
      {profileOnly && <div className="space-y-1"><label className="block text-xs font-bold text-slate-500">Objective / Professional Summary</label><textarea rows={3} value={value.summary} onChange={e => patch({ summary: e.target.value })} className={textareaCls} /></div>}


      <ExperienceSection
        experience={value.experience}
        expanded={expanded.experience}
        onToggle={() => toggle('experience')}
        onChange={(experience) => patch({ experience })}
      />

      <ProjectsSection
        projects={value.specialProjects}
        expanded={expanded.projects}
        onToggle={() => toggle('projects')}
        onChange={(specialProjects) => patch({ specialProjects })}
      />

      <EducationSection
        academic={value.academic}
        expanded={expanded.education}
        onToggle={() => toggle('education')}
        onChange={(academic) => patch({ academic })}
        readOnly={false}
      />

      <CertificationsSection
        certifications={value.certifications}
        expanded={expanded.certifications}
        onToggle={() => toggle('certifications')}
        onChange={(certifications) => patch({ certifications })}
      />
    </div>
  );
}
