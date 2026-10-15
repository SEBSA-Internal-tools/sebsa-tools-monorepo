'use client';

import React, { useState } from 'react';
import { FileText, Briefcase, Lightbulb, Award, ArrowRight, Sparkles, Loader2, Plus, Trash2 } from 'lucide-react';
import { SectionCard, EducationSection, textareaCls } from '@/app/components/CvEntrySections';
import type { CvExperienceEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { toTitleCase } from '@/lib/text';
import type {
  CvSuggestion,
  CvSuggestionExperience,
  CvSuggestionProject,
  CvSuggestionCertification,
} from './types';

export interface CvSuggestionSelection {
  summary: string;
  academic: CvSuggestion['academic'];
  experience: CvExperienceEntry[];
  specialProjects: CvProjectEntry[];
  certifications: CvCertificationEntry[];
}

export interface CvSuggestionDraft {
  includeObjective: boolean;
  objective: string;
  experience: CvSuggestionExperience[];
  projects: CvSuggestionProject[];
  certifications: CvSuggestionCertification[];
}

interface CvSuggestionSelectorProps {
  suggestion: CvSuggestion;
  draft: CvSuggestionDraft;
  onDraftChange: (draft: CvSuggestionDraft) => void;
  onApply: (selection: CvSuggestionSelection) => Promise<void>;
  applying: boolean;
  /** True once the live one-page preview (driven by this same draft, measured by the parent)
   *  exceeds one page — blocks Apply until the selection is trimmed back down. */
  pageLimitExceeded?: boolean;
}

const checkboxCls = 'w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer shrink-0';
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100';
const smallInputCls = `${inputCls} py-1.5 text-[11px]`;

const nextIndex = (items: { index: number }[]) =>
  items.length === 0 ? 0 : Math.max(...items.map((item) => item.index)) + 1;

/**
 * Pure projection from the in-progress draft (checkbox state) to the actual selected content —
 * the same shape "Continue" hands to GenerateClient. Exported so GenerateClient can derive a live
 * preview CV from the draft as the user checks/unchecks items, without duplicating this filtering
 * logic or drifting from what "Continue" actually applies.
 */
export function buildSelectionFromDraft(
  draft: CvSuggestionDraft,
  academic: CvSuggestion['academic']
): CvSuggestionSelection {
  return {
    summary: draft.includeObjective ? draft.objective : '',
    academic,
    experience: draft.experience
      .filter((e) => e.relevant)
      .map((e) => ({
        position: e.position,
        company: e.company,
        period: e.period,
        tasks: e.tasks.filter((t) => t.relevant).map((t) => t.text),
      })),
    specialProjects: draft.projects
      .filter((p) => p.relevant)
      .map((p) => ({
        title: p.title,
        brief: p.brief,
        skills: [],
      })),
    certifications: draft.certifications
      .filter((c) => c.relevant)
      .map((c) => ({ name: c.name, issuer: c.issuer, year: c.year })),
  };
}

/**
 * Review step for the AI's content SELECTION (never generation — see suggestCvContentAction's
 * doc comment) — every project/experience/skill/task/certification shown here is the employee's
 * own real data with the AI's relevance flag as the initial checkbox state, which the user can
 * freely override. Only Objective is AI-written text. Checking "I verified the generated content"
 * and clicking Apply saves the selected subset directly as the CV and moves to Preview & Export —
 * Edits and manually added items live only in this local draft. Applying projects the checked
 * draft into generated_cvs.content; no profile mutation is performed anywhere in this flow.
 */
export default function CvSuggestionSelector({
  suggestion,
  draft,
  onDraftChange,
  onApply,
  applying,
  pageLimitExceeded = false,
}: CvSuggestionSelectorProps) {
  const [isVerified, setIsVerified] = useState(false);
  const { includeObjective, objective, experience, projects, certifications } = draft;

  const toggleExperience = (index: number) =>
    onDraftChange({
      ...draft,
      experience: experience.map((e) => (e.index === index ? { ...e, relevant: !e.relevant } : e)),
    });
  const toggleTask = (expIndex: number, taskIndex: number) =>
    onDraftChange({
      ...draft,
      experience: experience.map((e) =>
        e.index !== expIndex
          ? e
          : { ...e, tasks: e.tasks.map((t) => (t.index === taskIndex ? { ...t, relevant: !t.relevant } : t)) }
      ),
    });

  const toggleProject = (index: number) =>
    onDraftChange({
      ...draft,
      projects: projects.map((p) => (p.index === index ? { ...p, relevant: !p.relevant } : p)),
    });
  const toggleCertification = (index: number) =>
    onDraftChange({
      ...draft,
      certifications: certifications.map((c) =>
        c.index === index ? { ...c, relevant: !c.relevant } : c
      ),
    });

  const updateExperience = (index: number, patch: Partial<CvSuggestionExperience>) =>
    onDraftChange({ ...draft, experience: experience.map((item) => item.index === index ? { ...item, ...patch } : item) });
  const updateTask = (expIndex: number, taskIndex: number, text: string) =>
    onDraftChange({
      ...draft,
      experience: experience.map((item) => item.index === expIndex
        ? { ...item, tasks: item.tasks.map((task) => task.index === taskIndex ? { ...task, text } : task) }
        : item),
    });
  const addExperience = () => onDraftChange({
    ...draft,
    experience: [...experience, {
      index: nextIndex(experience), position: '', company: '', period: '', relevant: true,
      tasks: [{ index: 0, text: '', relevant: true }],
    }],
  });

  const updateProject = (index: number, patch: Partial<CvSuggestionProject>) =>
    onDraftChange({ ...draft, projects: projects.map((item) => item.index === index ? { ...item, ...patch } : item) });
  const updateProjectPoint = (projectIndex: number, pointIndex: number, text: string) => {
    const project = projects.find((item) => item.index === projectIndex);
    if (!project) return;
    const points = project.brief.split(/\r?\n/);
    points[pointIndex] = text;
    updateProject(projectIndex, { brief: points.join('\n') });
  };
  const addProjectPoint = (projectIndex: number) => {
    const project = projects.find((item) => item.index === projectIndex);
    if (!project) return;
    updateProject(projectIndex, { brief: `${project.brief}\n` });
  };
  const removeProjectPoint = (projectIndex: number, pointIndex: number) => {
    const project = projects.find((item) => item.index === projectIndex);
    if (!project) return;
    const points = project.brief.split(/\r?\n/).filter((_, index) => index !== pointIndex);
    updateProject(projectIndex, { brief: points.join('\n') });
  };
  const addProject = () => onDraftChange({
    ...draft,
    projects: [...projects, {
      index: nextIndex(projects), title: '', brief: '', relevant: true,
      skills: [],
    }],
  });

  const updateCertification = (index: number, patch: Partial<CvSuggestionCertification>) =>
    onDraftChange({ ...draft, certifications: certifications.map((item) => item.index === index ? { ...item, ...patch } : item) });
  const addCertification = () => onDraftChange({
    ...draft,
    certifications: [...certifications, { index: nextIndex(certifications), name: '', issuer: '', year: '', relevant: true }],
  });

  const selectedExperienceCount = experience.filter((e) => e.relevant).length;
  const selectedProjectCount = projects.filter((p) => p.relevant).length;
  const selectedCertCount = certifications.filter((c) => c.relevant).length;

  const handleApply = async () => {
    if (!isVerified || applying || pageLimitExceeded) return;
    await onApply(buildSelectionFromDraft(draft, suggestion.academic));
  };

  return (
    <div className="space-y-4">
      <div className="mb-1 px-5 py-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center gap-2.5">
        <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
        <div>
          <p className="text-xs font-black text-indigo-800">AI Suggested Selection — Review Before Continuing</p>
          <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
            AI suggestions start from the employee profile. Edit or add CV-only content here, choose what to include,
            then apply it to this customized CV. The employee profile will not be changed.
          </p>
        </div>
      </div>

      {/* Objective — the one AI-generated field */}
      <SectionCard label="Objective / Summary" icon={FileText} expanded onToggle={() => {}}>
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeObjective}
            onChange={(event) => onDraftChange({ ...draft, includeObjective: event.target.checked })}
            className={checkboxCls}
          />
          <span className="text-xs font-bold text-slate-700">Include Objective section in CV</span>
        </label>
        <textarea
          rows={5}
          value={objective}
          onChange={(e) => onDraftChange({ ...draft, objective: e.target.value })}
          disabled={!includeObjective}
          placeholder="Customized objective for this opportunity..."
          className={`${textareaCls} disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400`}
        />
      </SectionCard>

      {/* Academic — read-only, never selectable, never modified */}
      <EducationSection academic={suggestion.academic} expanded onToggle={() => {}} onChange={() => {}} readOnly />

      {/* Work Experience */}
      <SectionCard
        label="Work Experience"
        icon={Briefcase}
        count={selectedExperienceCount}
        expanded
        onToggle={() => {}}
      >
        {experience.length === 0 && <p className="text-xs text-slate-400 italic">No experience on record.</p>}
        {experience.map((exp) => (
          <div key={exp.index} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={exp.relevant}
                onChange={() => toggleExperience(exp.index)}
                className={`${checkboxCls} mt-0.5`}
              />
              <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={exp.position} onBlur={(e) => updateExperience(exp.index, { position: toTitleCase(e.target.value) })} onChange={(e) => updateExperience(exp.index, { position: e.target.value })} placeholder="Role" className={inputCls} />
                <input value={exp.company} onChange={(e) => updateExperience(exp.index, { company: e.target.value })} placeholder="Company" className={inputCls} />
                <input value={exp.period} onChange={(e) => updateExperience(exp.index, { period: e.target.value })} placeholder="Period (optional)" className={`${smallInputCls} sm:col-span-2`} />
              </div>
              <button type="button" onClick={() => onDraftChange({ ...draft, experience: experience.filter((item) => item.index !== exp.index) })} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove work experience"><Trash2 className="w-4 h-4" /></button>
            </div>

            {exp.relevant && (
              <div className="pl-6.5 space-y-1.5">
                {exp.tasks.map((task) => (
                  <div key={task.index} className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={task.relevant}
                      onChange={() => toggleTask(exp.index, task.index)}
                      className={`${checkboxCls} mt-0.5`}
                    />
                    <textarea rows={2} value={task.text} onChange={(e) => updateTask(exp.index, task.index, e.target.value)} placeholder="Responsibility" className={smallInputCls} />
                    <button type="button" onClick={() => updateExperience(exp.index, { tasks: exp.tasks.filter((item) => item.index !== task.index) })} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Remove responsibility"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => updateExperience(exp.index, { tasks: [...exp.tasks, { index: nextIndex(exp.tasks), text: '', relevant: true }] })} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600"><Plus className="w-3 h-3" /> Add responsibility</button>
              </div>
            )}
          </div>
        ))}
        <button type="button" onClick={addExperience} className="flex items-center gap-2 px-3 py-2 border border-dashed border-indigo-300 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Plus className="w-4 h-4" /> Add work experience</button>
      </SectionCard>

      {/* Special Projects */}
      <SectionCard label="Special Projects" icon={Lightbulb} count={selectedProjectCount} expanded onToggle={() => {}}>
        {projects.length === 0 && <p className="text-xs text-slate-400 italic">No special projects on record.</p>}
        {projects.map((proj) => (
          <div key={proj.index} className="border border-slate-200 rounded-xl p-4 bg-slate-50/30 space-y-2.5">
            <div className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={proj.relevant}
                onChange={() => toggleProject(proj.index)}
                className={`${checkboxCls} mt-0.5`}
              />
              <div className="min-w-0 flex-1 space-y-2">
                <input value={proj.title} onChange={(e) => updateProject(proj.index, { title: e.target.value })} placeholder="Project title" className={inputCls} />
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-500 uppercase block">Project Description Points</label>
                  {proj.brief.split(/\r?\n/).map((point, pointIndex) => (
                    <div key={pointIndex} className="flex items-start gap-2">
                      <span className="text-slate-400 mt-2 text-sm leading-none select-none">•</span>
                      <textarea
                        rows={2}
                        value={point}
                        onChange={(event) => updateProjectPoint(proj.index, pointIndex, event.target.value)}
                        placeholder="Describe one project contribution or outcome..."
                        className={smallInputCls}
                      />
                      <button type="button" onClick={() => removeProjectPoint(proj.index, pointIndex)} disabled={proj.brief.split(/\r?\n/).length <= 1} className="p-1 text-slate-400 hover:text-rose-600 disabled:opacity-25" aria-label="Remove project description point"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}
                  <button type="button" onClick={() => addProjectPoint(proj.index)} className="flex items-center gap-1 text-[10px] font-bold text-indigo-600"><Plus className="w-3 h-3" /> Add description point</button>
                </div>
              </div>
              <button type="button" onClick={() => onDraftChange({ ...draft, projects: projects.filter((item) => item.index !== proj.index) })} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove project"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ))}
        <button type="button" onClick={addProject} className="flex items-center gap-2 px-3 py-2 border border-dashed border-indigo-300 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Plus className="w-4 h-4" /> Add project</button>
      </SectionCard>

      {/* Certifications */}
      <SectionCard label="Certifications" icon={Award} count={selectedCertCount} expanded onToggle={() => {}}>
        {certifications.length === 0 && <p className="text-xs text-slate-400 italic">No certifications on record.</p>}
        {certifications.map((cert) => (
          <div
            key={cert.index}
            className="flex items-start gap-2.5 border border-slate-200 rounded-xl p-4 bg-slate-50/30"
          >
            <input
              type="checkbox"
              checked={cert.relevant}
              onChange={() => toggleCertification(cert.index)}
              className={`${checkboxCls} mt-0.5`}
            />
            <div className="min-w-0 flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={cert.name} onChange={(e) => updateCertification(cert.index, { name: e.target.value })} placeholder="Certification name" className={`${inputCls} sm:col-span-2`} />
              <input value={cert.issuer} onChange={(e) => updateCertification(cert.index, { issuer: e.target.value })} placeholder="Issuer (optional)" className={smallInputCls} />
              <input value={cert.year} onChange={(e) => updateCertification(cert.index, { year: e.target.value })} placeholder="Year (optional)" className={smallInputCls} />
            </div>
            <button type="button" onClick={() => onDraftChange({ ...draft, certifications: certifications.filter((item) => item.index !== cert.index) })} className="p-1.5 text-slate-400 hover:text-rose-600" aria-label="Remove certification"><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
        <button type="button" onClick={addCertification} className="flex items-center gap-2 px-3 py-2 border border-dashed border-indigo-300 rounded-lg text-xs font-bold text-indigo-700 hover:bg-indigo-50"><Plus className="w-4 h-4" /> Add certification</button>
      </SectionCard>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <label className="flex items-center gap-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isVerified}
            onChange={(event) => setIsVerified(event.target.checked)}
            className={checkboxCls}
          />
          <span className="text-xs font-bold text-slate-700">I verified the generated content</span>
        </label>

        <button
          type="button"
          onClick={handleApply}
          disabled={!isVerified || applying || pageLimitExceeded}
          className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
        >
          {applying ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span>Applying...</span>
            </>
          ) : (
            <>
              <span>Apply to CV</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>
        {pageLimitExceeded && (
          <p className="text-[10px] font-bold text-rose-600 text-center leading-relaxed">
            Your selection exceeds one page — uncheck some content before applying.
          </p>
        )}
      </div>
    </div>
  );
}
