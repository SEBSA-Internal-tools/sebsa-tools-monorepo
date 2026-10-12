'use client';

import EmployeeDetailTabs from '@/app/components/EmployeeDetailTabs';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../../components/PageWrapper';
import type { Employee } from '@/types/domain';
import type { CvExperienceEntry } from '@/lib/cvTypes';
import { isAdminOrAbove, type UserRole } from '@/lib/roles';
import CvPreviewTemplate from '../../generate/CvPreviewTemplate';
import { buildTailoredCvFromEmployee } from '@/lib/templates/buildTailoredCvFromEmployee';
import {
  ArrowLeft,
  Mail,
  Layers,
  Award,
  GraduationCap,
  Sparkles,
  Download,
  Eye,
  ExternalLink,
  BadgeCheck,
  Clock,
  PenLine,
  X,
  UserCircle,
} from 'lucide-react';

interface EmployeeProfileClientProps {
  employee: Employee;
  viewerRole: UserRole;
}

export default function EmployeeProfileClient({ employee, viewerRole }: EmployeeProfileClientProps) {
  const router = useRouter();
  const canGenerateCv = isAdminOrAbove(viewerRole);
  // Admin/Super Admin can edit anyone's profile (docs/04-rbac-security.md §2) — surfaced here as
  // a pencil icon instead of a standalone "Update Profile" sidebar page/menu item, so editing
  // starts from the profile you're already looking at rather than a separate employee picker.
  const canEditAnyProfile = isAdminOrAbove(viewerRole);

  const handleBack = () => {
    router.push('/repository');
  };

  // ── Preview the actual CV template (docs/04-rbac-security.md §15) ──────────────────────────
  // Available to whoever can view this page — most usefully an Employee viewing their own CV, but
  // also lets Admins/Reviewers see a quick copy without the full "Customize CVs" wizard.
  const [showPreview, setShowPreview] = useState(false);

  const tailoredCv = useMemo(() => buildTailoredCvFromEmployee(employee), [employee]);

  // A self-service signup (or an Admin-provisioned account, §14) links `user_id` immediately —
  // separate from whether the profile itself has cleared review yet. Show "Pending Approval"
  // while status is still 'draft' rather than a misleading "Active".
  const isPendingApproval = employee.status === 'draft';

  // Download PDF never exports straight from here — for anyone viewing this page (Employee on
  // their own profile, or Admin/Reviewer on any profile, as long as they're not already inside the
  // AI "Customize this CV" flow) it hands off to the Download CV content-selection/checkbox
  // screen, so the same one-page-limit gating governs every plain (non-customized) download.
  const handleDownloadPdf = () => {
    router.push(`/download-cv?id=${encodeURIComponent(employee.rowId)}`);
  };

  // ── Prefer structured CV fields; fall back to legacy or demo data ─────────

  // Structured experience (from Gemini parsing pipeline)
  const cvExperience: CvExperienceEntry[] = employee.cvExperience ?? [];

  // Legacy experience fallback
  const experience = employee.experience || [
    {
      role: employee.role,
      company: 'Global Enterprises Inc.',
      type: 'Full-time',
      period: 'Jan 2020 — Present',
      desc: `Responsible for leading design and implementation of highly scaling solutions in the ${employee.department} department. Managed a cross-functional squad of 5 engineers to release product cycles on schedule.`,
    },
    {
      role: `Mid-level ${employee.role.replace('Senior ', '')}`,
      company: 'Startup Lab Ltd.',
      type: 'Full-time',
      period: 'Jun 2017 — Dec 2019',
      desc: 'Collaborated closely with cross-functional partners to craft, code, and launch clean client experiences. Reduced loading bottlenecks by 22% using advanced modular component schemas.',
    },
  ];

  // Special projects (structured)
  const specialProjects = employee.specialProjects ?? [];

  // Legacy projects fallback
  const projects = employee.projects || [
    {
      name: 'Project Delta-Prime',
      desc: 'Re-engineering product structure with serverless technologies.',
    },
    {
      name: 'Hyperion core analytics',
      desc: 'AI-driven data query model built on Python databases.',
    },
  ];

  // Structured certifications
  const cvCertifications = employee.cvCertifications ?? [];

  const certs = employee.certs || [
    'Certified Specialist (Standard Consortium • Exp. 2026)',
    'Advanced Professional Practitioner (Tech Guild • 2021)',
  ];

  // Structured academic entries
  const cvAcademic = employee.cvAcademic ?? [];
  const education = employee.education || 'B.Sc. Software Engineering (State University • 2016)';

  return (
    <PageWrapper className="p-8">
      {/* Breadcrumb / Back button — Employees only ever see their own profile here (repository is
          Admin/Reviewer-only, docs/04-rbac-security.md §2), so "Back to Repository" would just
          bounce them right back to this same page. Only show it to viewers who can actually go
          somewhere else. */}
      <div className="flex items-center justify-between mb-6">
        {viewerRole !== 'employee' ? (
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider group cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            <span>Back to Repository</span>
          </button>
        ) : (
          <span />
        )}

        {viewerRole === 'employee' && employee.status === 'published' && !employee.hasPendingChange && (
          <button
            onClick={() => router.push('/my-profile')}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wide transition-colors"
          >
            <PenLine className="w-3.5 h-3.5" />
            <span>Edit Profile</span>
          </button>
        )}

        {canEditAnyProfile && (
          <button
            onClick={() => router.push(`/update-profile?id=${encodeURIComponent(employee.rowId)}`)}
            title="Update this profile"
            className="p-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-sm active:scale-95 transition-all cursor-pointer"
          >
            <PenLine className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Review status banners */}
      {employee.status === 'draft' && (
        <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200/60 rounded-xl text-amber-700">
          <Clock className="w-4 h-4 shrink-0" />
          <p className="text-xs font-semibold">
            This profile is pending review by Admins — it won't appear in the general repository
            until approved.
          </p>
        </div>
      )}
      {employee.hasPendingChange && (
        <div className="mb-6 flex items-center gap-2.5 px-4 py-3 bg-amber-50 border border-amber-200/60 rounded-xl text-amber-700">
          <Clock className="w-4 h-4 shrink-0" />
          <p className="text-xs font-semibold">
            A proposed update to this profile is pending review.
          </p>
        </div>
      )}

      {/* Two Column Dashboard Grid */}
      <div className="grid grid-cols-12 gap-8">
        {/* Left 8 Columns: Dynamic Profile Details */}
        <div className="col-span-12 lg:col-span-8 flex flex-col gap-8">
          {/* Main profile banner card */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-6 flex flex-col sm:flex-row gap-6 relative overflow-hidden">
            {/* Ambient visual overlay */}
            <div className="absolute right-0 top-0 w-32 h-32 bg-indigo-50 rounded-full blur-3xl pointer-events-none"></div>

            <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden shrink-0 border border-slate-200 flex items-center justify-center bg-slate-100">
              {employee.avatar && !employee.avatar.includes('unsplash.com') ? (
                <img src={employee.avatar} alt={employee.name} className="w-full h-full object-cover" />
              ) : (
                <UserCircle className="w-16 h-16 text-slate-300" />
              )}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-between">
              <div>
                <div className="flex flex-wrap items-baseline gap-2.5">
                  <h3 className="text-2xl font-black text-slate-900 tracking-tight font-sans">
                    {employee.name}
                  </h3>
                </div>
                <p className="text-sm font-bold text-slate-700 mt-1">{employee.role}</p>

                <div className="flex flex-wrap gap-y-2 gap-x-4 mt-3 text-slate-500 font-sans text-xs">
                  <div className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span>{employee.email}</span>
                  </div>
                </div>
              </div>

              {/* Verify Match button CTA */}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded flex items-center gap-1.5 ${
                  isPendingApproval
                    ? 'bg-amber-50 border border-amber-200/50 text-amber-700'
                    : employee.isAccountLinked
                    ? 'bg-emerald-50 border border-emerald-200/50 text-emerald-700'
                    : 'bg-slate-50 border border-slate-200/50 text-slate-400'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    isPendingApproval ? 'bg-amber-500' : employee.isAccountLinked ? 'bg-emerald-500' : 'bg-slate-400'
                  }`} />
                  {isPendingApproval ? 'Pending Approval' : `Account ${employee.isAccountLinked ? 'Active' : 'Inactive'}`}
                </span>
                {canGenerateCv && (
                  <button
                    onClick={() => router.push(`/generate?name=${encodeURIComponent(employee.name)}`)}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-full shadow-md shadow-indigo-600/10 active:scale-95 transition-transform flex items-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-300" />
                    <span>Customize this CV</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Interactive tabs navigation */}
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col flex-1">
            <EmployeeDetailTabs value={employee}>
            {/* Tab content panel */}
            <div className="flex-1 space-y-6">
              <div><h4 className="text-xs font-bold text-slate-500 mb-2">Professional Summary</h4><p className="text-sm whitespace-pre-wrap">{employee.summary || 'No summary provided.'}</p></div>
              {(
                <div className="relative border-l border-slate-200 pl-6 ml-3 space-y-8">
                  {/* Prefer structured Gemini-parsed experience with point-wise tasks */}
                  {cvExperience.length > 0
                    ? cvExperience.map((exp, i) => (
                        <div key={i} className="relative group">
                          <span className="absolute -left-[31px] top-1 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full group-hover:scale-125 transition-transform"></span>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-black text-slate-800 leading-snug">{exp.position}</h4>
                              <p className="text-xs font-bold text-slate-500 mt-0.5">{exp.company}</p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 border border-slate-200/50 px-2.5 py-1 rounded-full self-start sm:self-auto mt-2 sm:mt-0">
                              {exp.period}
                            </span>
                          </div>
                          {exp.tasks.length > 0 && (
                            <ul className="mt-2 space-y-1.5">
                              {exp.tasks.map((task, ti) => (
                                <li key={ti} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                                  <span className="text-indigo-400 mt-0.5 shrink-0">▸</span>
                                  <span>{task}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ))
                    : experience.map((exp, i) => (
                        <div key={i} className="relative group">
                          <span className="absolute -left-[31px] top-1 w-4 h-4 bg-white border-2 border-indigo-600 rounded-full group-hover:scale-125 transition-transform"></span>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-black text-slate-800 leading-snug">{exp.role}</h4>
                              <p className="text-xs font-bold text-slate-500 mt-0.5">
                                {exp.company} • <span className="text-slate-400 font-medium">{exp.type}</span>
                              </p>
                            </div>
                            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 border border-slate-200/50 px-2.5 py-1 rounded-full self-start sm:self-auto mt-2 sm:mt-0">
                              {exp.period}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 leading-relaxed max-w-2xl">{exp.desc}</p>
                        </div>
                      ))}
                </div>
              )}

              {(
                <div className="space-y-6">
                  {/* Special Projects — prefer structured, fall back to legacy */}
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-slate-500" />
                      <span>Key Portfolios & Projects</span>
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(specialProjects.length > 0 ? specialProjects : projects.map((p) => ({ title: p.name, brief: p.desc }))).map((proj, i) => (
                        <div
                          key={i}
                          className="p-4 border border-slate-200/60 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition-colors"
                        >
                          <h5 className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                            {proj.title}
                            <ExternalLink className="w-3 h-3 text-slate-400" />
                          </h5>
                          <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                            {proj.brief}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Certifications — prefer structured */}
                  <div className="pt-6 border-t border-slate-100">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-slate-500" />
                      <span>Professional Certifications</span>
                    </h4>
                    <div className="space-y-2.5">
                      {cvCertifications.length > 0
                        ? cvCertifications.map((cert, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 p-3 border border-slate-150 rounded-xl bg-indigo-50/20"
                            >
                              <BadgeCheck className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-slate-700">{cert.name}</p>
                                {(cert.issuer || cert.year) && (
                                  <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                    {[cert.issuer, cert.year].filter(Boolean).join(' • ')}
                                  </p>
                                )}
                              </div>
                            </div>
                          ))
                        : certs.map((cert, i) => (
                            <div
                              key={i}
                              className="flex items-center gap-3 p-3 border border-slate-150 rounded-xl bg-indigo-50/20"
                            >
                              <BadgeCheck className="w-4.5 h-4.5 text-indigo-600 shrink-0" />
                              <span className="text-xs font-semibold text-slate-700">{cert}</span>
                            </div>
                          ))}
                    </div>
                  </div>

                  {/* Academic — prefer structured entries */}
                  <div className="pt-6 border-t border-slate-100">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                      <GraduationCap className="w-4.5 h-4.5 text-slate-500" />
                      <span>Academic Background</span>
                    </h4>
                    {cvAcademic.length > 0 ? (
                      <div className="space-y-2.5">
                        {cvAcademic.map((entry, i) => (
                          <div key={i} className="p-3 border border-slate-150 rounded-xl bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <p className="text-xs font-bold text-slate-700">{entry.qualification}</p>
                              <p className="text-[11px] text-slate-500 font-medium mt-0.5">{entry.institution}</p>
                            </div>
                            <span className="text-[10px] font-black text-slate-400 bg-slate-100 border border-slate-200/50 px-2.5 py-1 rounded-full shrink-0">
                              {entry.period}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-3 border border-slate-150 rounded-xl bg-slate-50 text-xs font-semibold text-slate-700">
                        {education}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            </EmployeeDetailTabs>
          </div>
        </div>

        {/* Right 4 Columns: Interactive PDF mock widget */}
        <div className="col-span-12 lg:col-span-4 flex flex-col gap-6">
          {/* Structured Original CV Previewer Card */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
            <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-slate-400" />
              <span>Structured CV Preview</span>
            </h4>

            {/* CV Template thumbnail — click to open the real template preview */}
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="w-full relative group cursor-pointer rounded-xl overflow-hidden border border-slate-200/80 mb-4 bg-slate-50"
              style={{ height: '220px' }}
            >
              <div className="absolute inset-0 bg-slate-900/5 group-hover:bg-slate-900/15 transition-colors duration-300 pointer-events-none flex items-center justify-center z-10">
                <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1.5 rounded-full flex items-center gap-1.5">
                  <Eye className="w-3 h-3" /> View Full Preview
                </span>
              </div>
              {/* Scaled-down live CV template preview — decorative only, given its own id so it
                  never collides with the default 'cv-preview-root' id CvPreviewTemplate/exportToPdf
                  use elsewhere in the app. */}
              <div
                className="pointer-events-none absolute top-0 left-0 origin-top-left"
                style={{ transform: 'scale(0.28)', width: '357%', transformOrigin: 'top left' }}
              >
                <CvPreviewTemplate cv={tailoredCv} id="cv-preview-thumb" />
              </div>
            </button>

            {/* Actions panel — PDF only */}
            <div className="grid grid-cols-1 gap-3">
              <button
                type="button"
                onClick={handleDownloadPdf}
                className="flex items-center justify-center gap-1.5 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl text-xs hover:bg-slate-50 transition-colors active:scale-95 cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Download CV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Full CV Template Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h4 className="text-sm font-black text-slate-800">CV Preview — {tailoredCv.name}</h4>
                <p className="text-[11px] text-slate-450 font-medium mt-0.5">
                  Rendered against the current profile data.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 font-bold rounded-lg text-[11px] hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5 text-rose-500" />
                  <span>Download CV</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowPreview(false)}
                  className="p-1.5 hover:bg-slate-200/65 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-100 flex-1 flex justify-center">
              {/* Visible copy only — also its own id, kept out of the export capture path since
                  a scrollable/fixed-position ancestor can distort what html2canvas captures. */}
              <CvPreviewTemplate cv={tailoredCv} id="cv-preview-modal" />
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
