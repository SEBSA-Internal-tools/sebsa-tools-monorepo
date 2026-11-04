'use client';

import React from 'react';
import { Hash, Briefcase, Lightbulb, GraduationCap, Award, Plus, Trash2, ChevronDown, ChevronUp, Lock } from 'lucide-react';
import type { CvExperienceEntry, CvAcademicEntry, CvProjectEntry, CvCertificationEntry } from '@/lib/cvTypes';
import { toTitleCase } from '@/lib/text';
import { useDragReorder, moveItem, DragHandle } from '@/app/components/useDragReorder';

/**
 * Shared structured CV entry editors — collapsible add/remove sections for experience, special
 * projects, education, certifications, and a skill-chip input. Originally built inside
 * app/(authenticated)/generate/CvSectionEditor.tsx for editing TailoredCv; extracted here because
 * app/onboarding (create-from-scratch) and app/(authenticated)/my-profile (full-field self-edit)
 * need the exact same entry shapes (CvExperienceEntry etc. — lib/cvTypes.ts) and the exact same
 * editing UX. CvSectionEditor.tsx re-exports/uses these too, so there's one implementation, not
 * three copies drifting apart (see docs/04-rbac-security.md's history with mapCvToTemplateData
 * for why that's worth avoiding).
 */

export const inputCls =
  'w-full bg-white border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-semibold ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 ' +
  'transition-all text-slate-700 placeholder:text-slate-300';

export const textareaCls =
  'w-full bg-white border border-slate-200/80 rounded-lg px-3 py-2 text-xs font-medium ' +
  'focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 ' +
  'transition-all text-slate-700 leading-relaxed resize-none placeholder:text-slate-300';

export const dottedAddBtnCls =
  'w-full py-2.5 border-2 border-dashed border-slate-200 hover:border-indigo-300 ' +
  'hover:bg-indigo-50/30 rounded-xl text-xs font-bold text-slate-500 hover:text-indigo-600 ' +
  'transition-all flex items-center justify-center gap-1.5 cursor-pointer';

export function SectionCard({
  label,
  icon: Icon,
  count,
  expanded,
  onToggle,
  children,
}: {
  label: string;
  icon: React.ElementType;
  count?: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors border-b border-slate-100"
      >
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
            <Icon className="w-3.5 h-3.5 text-indigo-600" />
          </div>
          <span className="text-xs font-black uppercase tracking-widest text-slate-600">{label}</span>
          {count !== undefined && (
            <span className="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-full">
              {count}
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
        )}
      </button>
      {expanded && <div className="p-5 space-y-4">{children}</div>}
    </div>
  );
}

export function SkillsSection({
  skills,
  expanded,
  onToggle,
  onChange,
  label = 'Skills',
}: {
  skills: string[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: string[]) => void;
  label?: string;
}) {
  const [newSkill, setNewSkill] = React.useState('');

  const add = () => {
    const t = newSkill.trim();
    if (!t || skills.includes(t)) return;
    onChange([...skills, t]);
    setNewSkill('');
  };

  return (
    <SectionCard label={label} icon={Hash} count={skills.length} expanded={expanded} onToggle={onToggle}>
      <div className="flex flex-wrap gap-2 min-h-[36px]">
        {skills.length === 0 && <p className="text-xs text-slate-400 italic self-center">No skills added yet.</p>}
        {skills.map((skill, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-[11px] font-bold rounded-full"
          >
            {skill}
            <button
              type="button"
              onClick={() => onChange(skills.filter((_, i) => i !== idx))}
              className="text-indigo-400 hover:text-rose-500 leading-none transition-colors ml-0.5"
              aria-label={`Remove ${skill}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a skill and press Enter..."
          className={inputCls}
        />
        <button
          type="button"
          onClick={add}
          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </SectionCard>
  );
}

/**
 * Compact skill-chip editor for embedding inside a single project card (not its own collapsible
 * SectionCard, unlike SkillsSection above — same chip interaction, just lighter-weight). Shared
 * by ProjectsSection here plus the hand-rolled project forms in upload/page.tsx and
 * UpdateProfileClient.tsx, which don't reuse ProjectsSection itself.
 */
export function ProjectSkillsInput({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (v: string[]) => void;
}) {
  const [newSkill, setNewSkill] = React.useState('');

  const add = () => {
    const t = newSkill.trim();
    if (!t || skills.includes(t)) return;
    onChange([...skills, t]);
    setNewSkill('');
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-bold text-slate-500 uppercase block">Skills</label>
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {skills.length === 0 && (
          <p className="text-[11px] text-slate-400 italic self-center">No skills added yet.</p>
        )}
        {skills.map((skill, idx) => (
          <span
            key={idx}
            className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-100/80 text-indigo-700 text-[10.5px] font-bold rounded-full"
          >
            {skill}
            <button
              type="button"
              onClick={() => onChange(skills.filter((_, i) => i !== idx))}
              className="text-indigo-400 hover:text-rose-500 leading-none transition-colors ml-0.5"
              aria-label={`Remove ${skill}`}
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newSkill}
          onChange={(e) => setNewSkill(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Type a skill and press Enter..."
          className={inputCls}
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[10.5px] font-bold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
        >
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
    </div>
  );
}

export function ExperienceSection({
  experience,
  expanded,
  onToggle,
  onChange,
  positionLocked = false,
}: {
  experience: CvExperienceEntry[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: CvExperienceEntry[]) => void;
  /** Locks Position/Title to the profile's existing value — only appropriate in the Customize CV
   *  flow, where the AI is a content selector and must never introduce a title the profile doesn't
   *  already have. Profile creation/editing (onboarding, my-profile) needs this field editable, so
   *  it defaults to false. */
  positionLocked?: boolean;
}) {
  const drag = useDragReorder(experience.length, (from, to) => onChange(moveItem(experience, from, to)));
  const updateEntry = (idx: number, patch: Partial<CvExperienceEntry>) =>
    onChange(experience.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const removeEntry = (idx: number) => onChange(experience.filter((_, i) => i !== idx));
  const addEntry = () => onChange([...experience, { position: '', company: '', period: '', tasks: [''] }]);
  const updateTask = (expIdx: number, taskIdx: number, val: string) =>
    onChange(experience.map((e, i) => (i !== expIdx ? e : { ...e, tasks: e.tasks.map((t, ti) => (ti === taskIdx ? val : t)) })));
  const addTask = (expIdx: number) => onChange(experience.map((e, i) => (i !== expIdx ? e : { ...e, tasks: [...e.tasks, ''] })));
  const removeTask = (expIdx: number, taskIdx: number) =>
    onChange(experience.map((e, i) => (i !== expIdx ? e : { ...e, tasks: e.tasks.filter((_, ti) => ti !== taskIdx) })));

  return (
    <SectionCard label="Professional Experience" icon={Briefcase} count={experience.length} expanded={expanded} onToggle={onToggle}>
      {experience.map((exp, idx) => (
        <div key={idx} {...drag.cardProps(idx)} className={`border rounded-xl p-4 space-y-3 bg-slate-50/30 transition-colors ${drag.stateClass(idx)}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <DragHandle label="work experience" handleProps={drag.handleProps(idx)} />
              Experience {idx + 1}
            </span>
            <button type="button" onClick={() => removeEntry(idx)} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer" aria-label="Remove experience entry">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Position — locked (read-only) only in the Customize CV flow; editable everywhere else */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Position / Title</label>
              {positionLocked && (
                <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                  <Lock className="w-2.5 h-2.5" /> Locked
                </span>
              )}
            </div>
            {positionLocked ? (
              <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 select-none">
                {exp.position || <span className="text-slate-400 italic">No position set</span>}
              </div>
            ) : (
              <input
                type="text"
                value={exp.position}
                onBlur={(e) => updateEntry(idx, { position: toTitleCase(e.target.value) })}
                onChange={(e) => updateEntry(idx, { position: e.target.value })}
                placeholder="e.g. Senior Software Engineer"
                className={inputCls}
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Company / Organisation</label>
            <input type="text" value={exp.company} onChange={(e) => updateEntry(idx, { company: e.target.value })} placeholder="e.g. Acme Corp" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Period</label>
            <input type="text" value={exp.period} onChange={(e) => updateEntry(idx, { period: e.target.value })} placeholder="e.g. Jan 2020 – Dec 2023" className={inputCls} />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Key Responsibilities & Achievements</label>
            {exp.tasks.map((task, taskIdx) => (
              <div key={taskIdx} className="flex items-start gap-2">
                <span className="text-slate-300 mt-2.5 text-sm leading-none select-none">•</span>
                <textarea rows={2} value={task} onChange={(e) => updateTask(idx, taskIdx, e.target.value)} placeholder="Describe a key responsibility or achievement..." className={`flex-1 ${textareaCls}`} />
                <button type="button" onClick={() => removeTask(idx, taskIdx)} disabled={exp.tasks.length <= 1} className="text-rose-400 hover:text-rose-600 disabled:opacity-25 transition-colors mt-2 cursor-pointer shrink-0" aria-label="Remove task">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button type="button" onClick={() => addTask(idx)} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer transition-colors mt-1">
              <Plus className="w-3 h-3" /> Add responsibility
            </button>
          </div>
        </div>
      ))}
      <button type="button" onClick={addEntry} className={dottedAddBtnCls}>
        <Plus className="w-3.5 h-3.5" /> Add Experience Entry
      </button>
    </SectionCard>
  );
}

export function ProjectsSection({
  projects,
  expanded,
  onToggle,
  onChange,
  descriptionAsPoints = false,
  showSkills = true,
}: {
  projects: CvProjectEntry[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: CvProjectEntry[]) => void;
  descriptionAsPoints?: boolean;
  showSkills?: boolean;
}) {
  const drag = useDragReorder(projects.length, (from, to) => onChange(moveItem(projects, from, to)));
  return (
    <SectionCard label="Special Projects" icon={Lightbulb} count={projects.length} expanded={expanded} onToggle={onToggle}>
      {projects.map((proj, idx) => (
        <div key={idx} {...drag.cardProps(idx)} className={`border rounded-xl p-4 space-y-3 bg-slate-50/30 transition-colors ${drag.stateClass(idx)}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <DragHandle label="project" handleProps={drag.handleProps(idx)} />
              Project {idx + 1}
            </span>
            <button type="button" onClick={() => onChange(projects.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Project Title</label>
            <input type="text" value={proj.title} onChange={(e) => onChange(projects.map((p, i) => (i === idx ? { ...p, title: e.target.value } : p)))} placeholder="e.g. Kubernetes Migration Platform" className={inputCls} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">{descriptionAsPoints ? 'Project Description Points' : 'Brief Description'}</label>
            {descriptionAsPoints ? (
              <div className="space-y-2">
                {proj.brief.split(/\r?\n/).map((point, pointIdx) => (
                  <div key={pointIdx} className="flex items-start gap-2">
                    <span className="text-slate-300 mt-2.5 text-sm leading-none select-none">•</span>
                    <textarea rows={2} value={point} onChange={(event) => onChange(projects.map((project, projectIdx) => projectIdx !== idx ? project : { ...project, brief: project.brief.split(/\r?\n/).map((value, valueIdx) => valueIdx === pointIdx ? event.target.value : value).join('\n') }))} placeholder="Describe one project contribution or outcome..." className={`flex-1 ${textareaCls}`} />
                    <button type="button" onClick={() => onChange(projects.map((project, projectIdx) => projectIdx !== idx ? project : { ...project, brief: project.brief.split(/\r?\n/).filter((_, valueIdx) => valueIdx !== pointIdx).join('\n') }))} disabled={proj.brief.split(/\r?\n/).length <= 1} className="text-rose-400 hover:text-rose-600 disabled:opacity-25 transition-colors mt-2 cursor-pointer shrink-0" aria-label="Remove project description point"><Trash2 className="w-3 h-3" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => onChange(projects.map((project, projectIdx) => projectIdx === idx ? { ...project, brief: `${project.brief}\n` } : project))} className="flex items-center gap-1 text-[10px] text-indigo-600 hover:text-indigo-800 font-bold cursor-pointer transition-colors"><Plus className="w-3 h-3" /> Add description point</button>
              </div>
            ) : (
              <textarea rows={3} value={proj.brief} onChange={(e) => onChange(projects.map((p, i) => (i === idx ? { ...p, brief: e.target.value } : p)))} placeholder="Describe the project scope, your role, and the outcome..." className={textareaCls} />
            )}
          </div>
          {showSkills && (
            <ProjectSkillsInput
              skills={proj.skills ?? []}
              onChange={(skills) => onChange(projects.map((p, i) => (i === idx ? { ...p, skills } : p)))}
            />
          )}
        </div>
      ))}
      <button type="button" onClick={() => onChange([...projects, { title: '', brief: '', skills: [] }])} className={dottedAddBtnCls}>
        <Plus className="w-3.5 h-3.5" /> Add Project
      </button>
    </SectionCard>
  );
}

/**
 * EducationSection — supports both editable (onboarding/profile creation) and read-only
 * (CV customization in Generate flow) modes via the `readOnly` prop.
 *
 * readOnly=true (default): shows a lock notice; fields are displayed as static divs.
 * readOnly=false: users can add/edit/remove education entries (used in onboarding & my-profile).
 *
 * The onChange prop is kept in the signature for both modes; when readOnly=true it is never called.
 */
export function EducationSection({
  academic,
  expanded,
  onToggle,
  onChange,
  readOnly = true,
}: {
  academic: CvAcademicEntry[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: CvAcademicEntry[]) => void;
  readOnly?: boolean;
}) {
  const updateEntry = (idx: number, patch: Partial<CvAcademicEntry>) =>
    onChange(academic.map((e, i) => (i === idx ? { ...e, ...patch } : e)));
  const removeEntry = (idx: number) => onChange(academic.filter((_, i) => i !== idx));
  const addEntry = () => onChange([...academic, { qualification: '', institution: '', period: '' }]);

  return (
    <SectionCard label="Education" icon={GraduationCap} count={academic.length} expanded={expanded} onToggle={onToggle}>
      {/* Lock notice — only shown in read-only (CV customization) mode */}
      {readOnly && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <p className="text-[10px] font-bold text-amber-700 leading-snug">
            Academic qualifications are sourced directly from the employee profile and cannot be modified during CV customization.
          </p>
        </div>
      )}

      {academic.length === 0 && (
        <p className="text-xs text-slate-400 italic">No academic qualifications on record.</p>
      )}

      {academic.map((edu, idx) => (
        <div key={idx} className="border border-slate-200 rounded-xl p-4 space-y-3 bg-slate-50/50">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Education {idx + 1}</span>
            {!readOnly && (
              <button type="button" onClick={() => removeEntry(idx)} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer" aria-label="Remove education entry">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Qualification / Degree</label>
            {readOnly ? (
              <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700">
                {edu.qualification || <span className="text-slate-400 italic">—</span>}
              </div>
            ) : (
              <input type="text" value={edu.qualification} onChange={(e) => updateEntry(idx, { qualification: e.target.value })} placeholder="e.g. BSc Computer Science" className={inputCls} />
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Institution</label>
              {readOnly ? (
                <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700">
                  {edu.institution || <span className="text-slate-400 italic">—</span>}
                </div>
              ) : (
                <input type="text" value={edu.institution} onChange={(e) => updateEntry(idx, { institution: e.target.value })} placeholder="e.g. University of Colombo" className={inputCls} />
              )}
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Period</label>
              {readOnly ? (
                <div className="w-full bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700">
                  {edu.period || <span className="text-slate-400 italic">—</span>}
                </div>
              ) : (
                <input type="text" value={edu.period} onChange={(e) => updateEntry(idx, { period: e.target.value })} placeholder="e.g. 2016 – 2020" className={inputCls} />
              )}
            </div>
          </div>
        </div>
      ))}

      {!readOnly && (
        <button type="button" onClick={addEntry} className={dottedAddBtnCls}>
          <Plus className="w-3.5 h-3.5" /> Add Education Entry
        </button>
      )}
    </SectionCard>
  );
}

export function CertificationsSection({
  certifications,
  expanded,
  onToggle,
  onChange,
}: {
  certifications: CvCertificationEntry[];
  expanded: boolean;
  onToggle: () => void;
  onChange: (v: CvCertificationEntry[]) => void;
}) {
  const drag = useDragReorder(certifications.length, (from, to) => onChange(moveItem(certifications, from, to)));

  return (
    <SectionCard label="Certifications" icon={Award} count={certifications.length} expanded={expanded} onToggle={onToggle}>
      {certifications.map((cert, idx) => (
        <div key={idx} {...drag.cardProps(idx)} className={`border rounded-xl p-4 space-y-3 bg-slate-50/30 transition-colors ${drag.stateClass(idx)}`}>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
              <DragHandle label={`certification ${idx + 1}`} handleProps={drag.handleProps(idx)} />
              Certification {idx + 1}
            </span>
            <button type="button" onClick={() => onChange(certifications.filter((_, i) => i !== idx))} className="text-rose-400 hover:text-rose-600 transition-colors cursor-pointer">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-500 uppercase block">Certification Name *</label>
            <input type="text" required value={cert.name} onChange={(e) => onChange(certifications.map((c, i) => (i === idx ? { ...c, name: e.target.value } : c)))} placeholder="e.g. AWS Certified Solutions Architect" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Issuing Organisation *</label>
              <input type="text" required value={cert.issuer} onChange={(e) => onChange(certifications.map((c, i) => (i === idx ? { ...c, issuer: e.target.value } : c)))} placeholder="e.g. Amazon Web Services" className={inputCls} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase block">Year Obtained *</label>
              <input type="text" required value={cert.year} onChange={(e) => onChange(certifications.map((c, i) => (i === idx ? { ...c, year: e.target.value } : c)))} placeholder="e.g. 2023" className={inputCls} />
            </div>
          </div>
        </div>
      ))}
      <button type="button" onClick={() => onChange([...certifications, { name: '', issuer: '', year: '' }])} className={dottedAddBtnCls}>
        <Plus className="w-3.5 h-3.5" /> Add Certification
      </button>
    </SectionCard>
  );
}
