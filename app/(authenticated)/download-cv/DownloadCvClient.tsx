'use client';

import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import OnePagePreview from '@/app/components/OnePagePreview';
import CvPreviewTemplate from '../generate/CvPreviewTemplate';
import { SectionCard, EducationSection } from '@/app/components/CvEntrySections';
import { anonymizeTailoredCv, buildTailoredCvFromEmployee, buildTailoredCvFromSelection } from '@/lib/templates/buildTailoredCvFromEmployee';
import { buildSelectionFromDraft, type CvSuggestionDraft } from '../generate/CvSuggestionSelector';
import type { Employee } from '@/types/domain';
import { exportToPdf } from '@/lib/cvExport';
import { FileDown, Briefcase, Lightbulb, Award, FileText, ChevronLeft, Download, ListChecks } from 'lucide-react';
import { recordCvDownloadAction } from '../audit-actions';

interface DownloadCvClientProps {
  employee: Employee;
  /** False when an Admin/Reviewer landed here from another employee's profile page (via
   *  ?id=<employee>) rather than an Employee downloading their own — only changes copy/nav, never
   *  what's selectable or how export works. */
  isOwnProfile: boolean;
}

const checkboxCls = 'w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer shrink-0';

/** Every item defaults relevant — unlike the AI-driven Customize CV flow, this is a pure human
 *  selection of the employee's own already-published content; nothing is pre-filtered. */
function buildInitialDraft(cv: ReturnType<typeof buildTailoredCvFromEmployee>): CvSuggestionDraft {
  return {
    includeObjective: true,
    objective: cv.summary,
    experience: cv.experience.map((e, index) => ({
      index,
      position: e.position,
      company: e.company,
      period: e.period,
      relevant: true,
      tasks: e.tasks.map((text, ti) => ({ index: ti, text, relevant: true })),
    })),
    projects: cv.specialProjects.map((p, index) => ({
      index,
      title: p.title,
      brief: p.brief,
      relevant: true,
      skills: p.skills.map((text, si) => ({ index: si, text, relevant: true })),
    })),
    certifications: cv.certifications.map((c, index) => ({
      index,
      name: c.name,
      issuer: c.issuer,
      year: c.year,
      relevant: true,
    })),
  };
}

/**
 * Self-service "download my own CV" flow — no AI, no wording edits, just a checkbox selection of
 * the employee's own existing experience/projects/certifications (same interaction pattern as
 * CvSuggestionSelector.tsx, minus the AI framing) followed by the same preview + PDF export step
 * used by the Customize CVs wizard's final step.
 */
export default function DownloadCvClient({ employee, isOwnProfile }: DownloadCvClientProps) {
  const router = useRouter();
  const baseCv = useMemo(() => buildTailoredCvFromEmployee(employee), [employee]);
  const [phase, setPhase] = useState<'select' | 'preview'>('select');
  const [draft, setDraft] = useState<CvSuggestionDraft>(() => buildInitialDraft(baseCv));
  // Measured by the sidebar OnePagePreview (select phase only); kept around after moving to the
  // preview phase since previewCv doesn't change there — same value still gates the Export button.
  const [pageOverflowMm, setPageOverflowMm] = useState(0);

  const previewCv = useMemo(
    () => buildTailoredCvFromSelection(employee, '', buildSelectionFromDraft(draft, baseCv.academic)),
    [employee, draft, baseCv.academic]
  );
  const anonymousPreviewCv = useMemo(() => anonymizeTailoredCv(previewCv), [previewCv]);

  const { experience, projects, certifications } = draft;

  const toggleExperience = (index: number) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((e) => (e.index === index ? { ...e, relevant: !e.relevant } : e)),
    }));
  const toggleTask = (expIndex: number, taskIndex: number) =>
    setDraft((d) => ({
      ...d,
      experience: d.experience.map((e) =>
        e.index !== expIndex
          ? e
          : { ...e, tasks: e.tasks.map((t) => (t.index === taskIndex ? { ...t, relevant: !t.relevant } : t)) }
      ),
    }));
  const toggleProject = (index: number) =>
    setDraft((d) => ({
      ...d,
      projects: d.projects.map((p) => (p.index === index ? { ...p, relevant: !p.relevant } : p)),
    }));
  const toggleProjectSkill = (projIndex: number, skillIndex: number) =>
    setDraft((d) => ({
      ...d,
      projects: d.projects.map((p) =>
        p.index !== projIndex
          ? p
          : { ...p, skills: p.skills.map((s) => (s.index === skillIndex ? { ...s, relevant: !s.relevant } : s)) }
      ),
    }));
  const toggleCertification = (index: number) =>
    setDraft((d) => ({
      ...d,
      certifications: d.certifications.map((c) => (c.index === index ? { ...c, relevant: !c.relevant } : c)),
    }));

  const selectedExperienceCount = experience.filter((e) => e.relevant).length;
  const selectedProjectCount = projects.filter((p) => p.relevant).length;
  const selectedCertCount = certifications.filter((c) => c.relevant).length;

  const handleDownloadPdf = async (anonymous = false) => {
    try {
      await exportToPdf(
        anonymous ? 'anonymous-cv-preview-root' : 'cv-preview-root',
        anonymous ? `${anonymousPreviewCv.name}_Anonymous_CV` : `${baseCv.name.replace(/\s+/g, '_')}_CV`
      );
      await recordCvDownloadAction(employee.rowId, { anonymous, customized: false });
    } catch (err) {
      alert(err instanceof Error ? `Could not export to PDF: ${err.message}` : 'Could not export to PDF.');
    }
  };

  if (phase === 'preview') {
    return (
      <PageWrapper className="p-8">
        <div className="flex flex-col gap-6">
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setPhase('select')}
                className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors cursor-pointer active:scale-95"
                aria-label="Back to content selection"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h4 className="text-sm font-black text-slate-800">Preview &amp; Export</h4>
                <p className="text-[11px] text-slate-450 font-medium">
                  This is exactly what will be exported to PDF.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => handleDownloadPdf(false)} disabled={pageOverflowMm > 0} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm">
                <Download className="w-4 h-4 text-rose-500" /><span>Download CV</span>
              </button>
              <button type="button" onClick={() => handleDownloadPdf(true)} disabled={pageOverflowMm > 0} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer shadow-sm">
                <Download className="w-4 h-4" /><span>Anonymous CV Download</span>
              </button>
            </div>
          </div>

          {pageOverflowMm > 0 && (
            <p className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
              This selection exceeds one page — go back and uncheck some content before exporting.
            </p>
          )}

          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shadow-inner flex justify-center">
            <CvPreviewTemplate cv={previewCv} />
          </div>
          <div style={{ position: 'fixed', top: 0, left: '-10000px', zIndex: -1 }} aria-hidden="true">
            <CvPreviewTemplate cv={anonymousPreviewCv} id="anonymous-cv-preview-root" />
          </div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="p-8">
      <div className="mb-8 flex flex-col gap-3">
        {!isOwnProfile && (
          <button
            type="button"
            onClick={() => router.push(`/repository/${employee.rowId}`)}
            className="flex items-center gap-1.5 self-start px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors cursor-pointer active:scale-95 text-[11px] font-bold"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Profile</span>
          </button>
        )}
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
            {isOwnProfile ? 'Download CV' : `Download CV — ${baseCv.name}`}
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            {isOwnProfile
              ? 'Pick which of your own experience, projects, and certifications to include — no AI, no wording changes, just your existing profile content.'
              : `Pick which of ${baseCv.name}'s experience, projects, and certifications to include — no AI, no wording changes, just their existing profile content.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8 space-y-4">
          <SectionCard label="Objective / Summary" icon={FileText} expanded onToggle={() => {}}>
            <p className="text-xs font-medium text-slate-600 leading-relaxed whitespace-pre-line">
              {baseCv.summary || (
                <span className="text-slate-400 italic">
                  {isOwnProfile ? 'No objective set on your profile.' : 'No objective set on this profile.'}
                </span>
              )}
            </p>
          </SectionCard>

          <EducationSection academic={baseCv.academic} expanded onToggle={() => {}} onChange={() => {}} readOnly />

          <SectionCard label="Work Experience" icon={Briefcase} count={selectedExperienceCount} expanded onToggle={() => {}}>
            {experience.length === 0 && <p className="text-xs text-slate-400 italic">No experience on record.</p>}
            {experience.map((exp) => (
              <div key={exp.index} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={exp.relevant}
                    onChange={() => toggleExperience(exp.index)}
                    className={`${checkboxCls} mt-0.5`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800">
                      {exp.position} <span className="font-semibold text-slate-500">— {exp.company}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{exp.period}</p>
                  </div>
                </label>

                {exp.relevant && exp.tasks.length > 0 && (
                  <div className="pl-6.5 space-y-1.5">
                    {exp.tasks.map((task) => (
                      <label key={task.index} className="flex items-start gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={task.relevant}
                          onChange={() => toggleTask(exp.index, task.index)}
                          className={`${checkboxCls} mt-0.5`}
                        />
                        <span className="text-[11px] text-slate-600 leading-relaxed">{task.text}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>

          <SectionCard label="Special Projects" icon={Lightbulb} count={selectedProjectCount} expanded onToggle={() => {}}>
            {projects.length === 0 && <p className="text-xs text-slate-400 italic">No special projects on record.</p>}
            {projects.map((proj) => (
              <div key={proj.index} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-2.5">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proj.relevant}
                    onChange={() => toggleProject(proj.index)}
                    className={`${checkboxCls} mt-0.5`}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-800">{proj.title}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{proj.brief}</p>
                  </div>
                </label>

                {proj.relevant && proj.skills.length > 0 && (
                  <div className="pl-6.5 flex flex-wrap gap-1.5">
                    {proj.skills.map((skill) => (
                      <button
                        key={skill.index}
                        type="button"
                        onClick={() => toggleProjectSkill(proj.index, skill.index)}
                        className={`text-[10.5px] font-bold px-2.5 py-1 rounded-full border transition-colors cursor-pointer ${
                          skill.relevant
                            ? 'bg-indigo-50 border-indigo-100/80 text-indigo-700'
                            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300'
                        }`}
                      >
                        {skill.text}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </SectionCard>

          <SectionCard label="Certifications" icon={Award} count={selectedCertCount} expanded onToggle={() => {}}>
            {certifications.length === 0 && <p className="text-xs text-slate-400 italic">No certifications on record.</p>}
            {certifications.map((cert) => (
              <label
                key={cert.index}
                className="flex items-start gap-2.5 cursor-pointer border border-slate-200 rounded-xl p-4 bg-slate-50/30"
              >
                <input
                  type="checkbox"
                  checked={cert.relevant}
                  onChange={() => toggleCertification(cert.index)}
                  className={`${checkboxCls} mt-0.5`}
                />
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-800">{cert.name}</p>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
                    {cert.issuer}
                    {cert.year && ` (${cert.year})`}
                  </p>
                </div>
              </label>
            ))}
          </SectionCard>
        </div>

        <div className="col-span-12 lg:col-span-4">
          <div className="sticky top-6 bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
            <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
              <ListChecks className="w-4 h-4 text-indigo-650" />
              <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">Your Selection</h4>
            </div>

            <OnePagePreview cv={previewCv} id="cv-preview-download-thumb" onOverflowChange={setPageOverflowMm} />

            <button
              type="button"
              onClick={() => setPhase('preview')}
              disabled={pageOverflowMm > 0}
              className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>Continue to Download</span>
            </button>
            {pageOverflowMm > 0 && (
              <p className="text-[10px] font-bold text-rose-600 text-center leading-relaxed">
                Uncheck some content to fit one page before continuing.
              </p>
            )}
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}
