'use client';

import React, { useState, useMemo, Suspense } from 'react';
import Image from 'next/image';
import CvPreviewTemplate from './CvPreviewTemplate';
import CvSectionEditor from './CvSectionEditor';
import CvSuggestionSelector, {
  buildSelectionFromDraft,
  type CvSuggestionDraft,
  type CvSuggestionSelection,
} from './CvSuggestionSelector';
import { useSearchParams } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import OnePagePreview from '@/app/components/OnePagePreview';
import TalentSearchSelect from './TalentSearchSelect';
import type { Employee } from '@/types/domain';
import type { CvTemplateId, TailoredCv, CvSuggestion } from './types';
import {
  getSavedGeneratedCvAction,
  suggestCvContentAction,
  saveGeneratedCvAction,
} from './actions';
import { exportToPdf } from '@/lib/cvExport';
import { anonymizeTailoredCv, buildTailoredCvFromSelection, getCvDisplayName } from '@/lib/templates/buildTailoredCvFromEmployee';
import {
  BrainCircuit,
  Sparkles,
  Sliders,
  ChevronRight,
  ChevronLeft,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  UserCircle,
} from 'lucide-react';
import { recordCvDownloadAction } from '../audit-actions';

interface GenerateClientProps {
  employees: Employee[];
}

function buildReviewStateFromSavedCv(cv: TailoredCv): {
  suggestion: CvSuggestion;
  draft: CvSuggestionDraft;
} {
  const experience = cv.experience.map((entry, index) => ({
    ...entry,
    index,
    relevant: true,
    tasks: entry.tasks.map((text, taskIndex) => ({ index: taskIndex, text, relevant: true })),
  }));
  const projects = cv.specialProjects.map((project, index) => ({
    ...project,
    index,
    relevant: true,
    skills: [],
    descriptionPoints: project.brief.split(/\r?\n/).map((text, pointIndex) => ({
      index: pointIndex,
      text,
      relevant: true,
    })),
  }));
  const certifications = cv.certifications.map((certification, index) => ({
    ...certification,
    index,
    relevant: true,
  }));
  const academic = cv.academic.map((entry, index) => ({ ...entry, index, relevant: true }));

  return {
    suggestion: {
      originalObjective: cv.summary,
      objective: cv.summary,
      academic: cv.academic,
      experience,
      projects,
      certifications,
    },
    draft: {
      includeObjective: Boolean(cv.summary),
      objective: cv.summary,
      includeEducation: cv.includeEducation !== false,
      academic,
      experience,
      projects,
      certifications,
    },
  };
}

function TemplateSelector({
  value,
  onChange,
}: {
  value: CvTemplateId;
  onChange: (template: CvTemplateId) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor="cv-template-selector" className="text-xs font-bold text-slate-500 uppercase tracking-wide">
        CV Template
      </label>
      <select
        id="cv-template-selector"
        value={value}
        onChange={(event) => onChange(event.target.value as CvTemplateId)}
        className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all text-slate-700 cursor-pointer"
      >
        <option value="template1">Template 1 — Two-column layout</option>
        <option value="template2">Template 2 — Full-width content</option>
      </select>
      <p className="text-[10px] text-slate-400">
        Template 2 displays Objective, Experience, and Special Projects at full page width.
      </p>
    </div>
  );
}

export default function GenerateClient({ employees }: GenerateClientProps) {
  return (
    <Suspense
      fallback={
        <div className="p-8 flex items-center justify-center min-h-screen">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-650" />
        </div>
      }
    >
      <GeneratePageContent employees={employees} />
    </Suspense>
  );
}

function GeneratePageContent({ employees }: GenerateClientProps) {
  const searchParams = useSearchParams();
  const preselectedName = searchParams ? searchParams.get('name') : '';

  // ── Wizard step ─────────────────────────────────────────────────────────────
  // 1 = Parameters, 2 = Review & Edit, 3 = Preview & Export
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3>(1);

  // ── Step 1 form state ───────────────────────────────────────────────────────
  const [selectedCandidateId, setSelectedCandidateId] = useState(() => {
    const requestedName = preselectedName?.trim().toLowerCase();
    if (!requestedName) return '';
    return employees.find(
      (employee) =>
        employee.name.toLowerCase() === requestedName ||
        getCvDisplayName(employee).toLowerCase() === requestedName
    )?.rowId ?? '';
  });
  const [requiredSkills, setRequiredSkills] = useState('');
  const [preferredExp, setPreferredExp] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<CvTemplateId>('template1');

  // ── Generation state ────────────────────────────────────────────────────────
  const [customizingLoading, setCustomizingLoading] = useState(false);
  const [customizingError, setCustomizingError] = useState<string | null>(null);
  const [loadingLastCv, setLoadingLastCv] = useState(false);
  const [lastCvError, setLastCvError] = useState<string | null>(null);

  // ── AI suggestion + CV content state ────────────────────────────────────────
  // suggestion: the AI's relevance flags paired with the employee's real profile data (never
  // shown to the user until they've reviewed/adjusted it via CvSuggestionSelector). tailoredCv is
  // only set once the user verifies and applies their selection there — at that point it's
  // already been saved and Step 3 (comparison preview + export) is shown.
  const [suggestion, setSuggestion] = useState<CvSuggestion | null>(null);
  const [suggestionDraft, setSuggestionDraft] = useState<CvSuggestionDraft | null>(null);
  const [tailoredCv, setTailoredCv] = useState<TailoredCv | null>(null);
  const [restoredCvBase, setRestoredCvBase] = useState<TailoredCv | null>(null);

  // ── Save state ──────────────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [saveSuccess] = useState(false);
  const [isHumanVerified, setIsHumanVerified] = useState(false);

  // Mirrors the sidebar OnePagePreview's live measurement (see livePreviewCv below) so both
  // "Apply to CV" actions — CvSuggestionSelector's initial apply and the later continue-to-preview
  // button — can be disabled while the current selection/edit exceeds one page.
  const [previewOverflowMm, setPreviewOverflowMm] = useState(0);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const selectedEmployee = useMemo(
    () => employees.find((emp) => emp.rowId === selectedCandidateId),
    [employees, selectedCandidateId]
  );

  // Live preview of what "Continue"/"Apply to CV" would currently produce — recomputed on every
  // checkbox toggle in CvSuggestionSelector (select phase) so the sidebar preview below reacts in
  // real time. Once past that step, tailoredCv (kept live by CvSectionEditor's onChange) takes
  // over as the source, so the same preview keeps working while the user adds/edits content there.
  const draftPreviewCv = useMemo(
    () =>
      selectedEmployee && suggestion && suggestionDraft
        ? restoredCvBase
          ? {
              ...restoredCvBase,
              ...buildSelectionFromDraft(suggestionDraft),
              avatar: selectedEmployee.avatar,
              templateId: selectedTemplate,
            }
          : buildTailoredCvFromSelection(
              selectedEmployee,
              '',
              buildSelectionFromDraft(suggestionDraft),
              selectedTemplate
            )
        : null,
    [selectedEmployee, suggestion, suggestionDraft, selectedTemplate, restoredCvBase]
  );
  const livePreviewCv = tailoredCv ?? draftPreviewCv;

  // ── Step 3 "before / after" comparison (Complete Profile CV vs Customized CV) ──────────────
  // originalProfileCv: unfiltered "before" view of the whole profile, display-only.
  const originalProfileCv = useMemo(
    () =>
      selectedEmployee && suggestion
        ? {
            name: getCvDisplayName(selectedEmployee),
            currentPosition: selectedEmployee.currentPosition || selectedEmployee.role,
            summary: suggestion.originalObjective,
            customerName: '',
            skillsAligned: [],
            academic: suggestion.academic,
            experience: suggestion.experience.map((entry) => ({
              position: entry.position,
              company: entry.company,
              period: entry.period,
              tasks: entry.tasks.map((task) => task.text),
            })),
            specialProjects: suggestion.projects.map((project) => ({
              title: project.title,
              brief: project.brief,
              // Project skills are editing/selection metadata and should not appear
              // beneath projects in the final Complete Profile CV preview.
              skills: [],
            })),
            certifications: suggestion.certifications.map((certification) => ({
              name: certification.name,
              issuer: certification.issuer,
              year: certification.year,
            })),
            avatar: selectedEmployee.avatar,
          }
        : null,
    [selectedEmployee, suggestion]
  );

  // The final preview uses the exact object persisted to generated_cvs.content. This keeps
  // Preview & Export faithful to Apply to CV.
  const customizedPreviewCv = tailoredCv;

  // ── Pre-select employee from query param ────────────────────────────────────
  // ── Handlers ────────────────────────────────────────────────────────────────

  /**
   * Asks the AI which of the employee's existing projects/experience/certifications are
   * relevant to this opportunity (plus a customized Objective) — never a rewrite of the profile.
   * The result is reviewed/adjusted by the user in CvSuggestionSelector before anything is
   * actually applied to a CV (handleSelectionApply below).
   */
  const handleCustomize = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployee) return;

    setCustomizingLoading(true);
    setCustomizingError(null);
    setSuggestion(null);
    setSuggestionDraft(null);
    setTailoredCv(null);
    setRestoredCvBase(null);
    setWizardStep(2);

    try {
      const result = await suggestCvContentAction(
        selectedEmployee,
        requiredSkills,
        preferredExp
      );
      setSuggestion(result);
      setSuggestionDraft({
        includeObjective: true,
        objective: result.objective,
        includeEducation: true,
        academic: result.academic.map((entry, index) => ({ ...entry, index, relevant: true })),
        experience: result.experience,
        projects: result.projects.map((project) => ({
          ...project,
          descriptionPoints: project.brief.split(/\r?\n/).map((text, index) => ({
            index,
            text,
            relevant: true,
          })),
        })),
        certifications: result.certifications,
      });
    } catch (err) {
      setCustomizingError(
        err instanceof Error ? err.message : 'AI suggestion failed. Please check setup.'
      );
    } finally {
      setCustomizingLoading(false);
    }
  };

  /** Restores the selected employee's last saved customized CV without making an AI request. */
  const handleLoadLastCustomizedCv = async () => {
    if (!selectedEmployee || loadingLastCv) return;

    setLoadingLastCv(true);
    setLastCvError(null);
    try {
      const saved = await getSavedGeneratedCvAction(selectedEmployee.rowId);
      if (!saved) {
        setLastCvError('No previously customized CV was found for this employee.');
        return;
      }

      const requiredArrays = ['academic', 'experience', 'specialProjects', 'certifications'];
      const isValid =
        typeof saved.name === 'string' &&
        typeof saved.currentPosition === 'string' &&
        typeof saved.summary === 'string' &&
        requiredArrays.every((field) => Array.isArray(saved[field]));
      if (!isValid) {
        setLastCvError('The last customized CV is incomplete and cannot be loaded.');
        return;
      }

      const restoredCv: TailoredCv = {
        ...(saved as TailoredCv),
        customerName: typeof saved.customerName === 'string' ? saved.customerName : '',
        skillsAligned: Array.isArray(saved.skillsAligned) ? saved.skillsAligned : [],
        avatar: selectedEmployee.avatar,
        templateId: saved.templateId === 'template2' ? 'template2' : 'template1',
      };

      const reviewState = buildReviewStateFromSavedCv(restoredCv);
      setSuggestion(reviewState.suggestion);
      setSuggestionDraft(reviewState.draft);
      setTailoredCv(null);
      setRestoredCvBase(restoredCv);
      setSelectedTemplate(restoredCv.templateId ?? 'template1');
      setIsHumanVerified(false);
      setPreviewOverflowMm(0);
      setCustomizingError(null);
      setWizardStep(2);
    } catch (error) {
      setLastCvError(error instanceof Error ? error.message : 'Could not load the last customized CV.');
    } finally {
      setLoadingLastCv(false);
    }
  };

  /**
   * Called once the user has verified and applied their selection in CvSuggestionSelector.
   * Builds the actual TailoredCv from only the selected content, saves it, and advances straight
   * to Step 3 (comparison preview + export) — there is no separate wording-edit step in this flow.
   */
  const handleSelectionApply = async (selection: CvSuggestionSelection) => {
    if (!selectedEmployee) return;
    const cv: TailoredCv = restoredCvBase
      ? {
          ...restoredCvBase,
          ...selection,
          avatar: selectedEmployee.avatar,
          templateId: selectedTemplate,
        }
      : buildTailoredCvFromSelection(selectedEmployee, '', selection, selectedTemplate);

    setSaving(true);
    try {
      await saveGeneratedCvAction(selectedEmployee.rowId, cv);
      setTailoredCv(cv);
      setWizardStep(3);
    } catch (err) {
      alert(err instanceof Error ? `Save failed: ${err.message}` : 'Could not apply the selected content.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Saves the current (possibly edited) tailoredCv to the generated_cvs table.
   * Returns true on success, false on failure.
   */


  /**
   * Always saves the CV then navigates to Step 3 preview.
   * (The "Apply to Template" button is the single action — it saves + previews.)
   */


  const handleBackToSelection = () => {
    setTailoredCv(null);
    setWizardStep(suggestion ? 2 : 1);
  };

  const handleGoToPreview = () => setWizardStep(3);

  const handleDownloadDocx = async () => {
    if (!tailoredCv) return;
    try {
      await exportToPdf(
        'cv-preview-root',
        `${(tailoredCv.name ?? 'CV').replace(/\s+/g, '_')}_Tailored_CV`
      );
    } catch (err) {
      console.error('DOCX export failed:', err);
      alert(err instanceof Error ? err.message : 'Could not export to DOCX.');
    }
  };

  const handleDownloadPdf = async (anonymous = false) => {
    if (!tailoredCv || !selectedEmployee) return;
    try {
      // Keep generated_cvs as the latest downloadable customization for this employee. The
      // original, named content is saved even when the user chooses the anonymous export.
      await saveGeneratedCvAction(selectedEmployee.rowId, tailoredCv);
      await exportToPdf(
        anonymous ? 'anonymous-generated-cv-preview-root' : 'cv-preview-root',
        anonymous
          ? `${anonymizeTailoredCv(tailoredCv).name}_Anonymous_CV`
          : `${(tailoredCv.name ?? 'CV').replace(/\s+/g, '_')}_Tailored_CV`
      );
      await recordCvDownloadAction(selectedEmployee.rowId, { anonymous, customized: true });
    } catch (err) {
      console.error('PDF export failed:', err);
      alert(err instanceof Error ? `Could not export to PDF: ${err.message}` : 'Could not export to PDF.');
    }
  };

  // ── Empty state ─────────────────────────────────────────────────────────────
  if (employees.length === 0) {
    return (
      <PageWrapper className="p-8">
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 flex flex-col items-center text-center">
          <BrainCircuit className="w-10 h-10 text-slate-300 mb-4" />
          <h5 className="text-sm font-bold text-slate-700">No employee profiles found</h5>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
            Create at least one employee profile from the Create Profile page first.
          </p>
        </div>
      </PageWrapper>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <PageWrapper className="p-8">
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
            Customize CV
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Tailor, customize, and export high-fidelity CVs aligned perfectly to customer
            opportunity requirements.
          </p>
        </div>

        {/* Stepper */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl self-start sm:self-auto border border-slate-200/40">
          <span
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${
              wizardStep === 1 ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-400'
            }`}
          >
            1. PARAMETERS
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${
              wizardStep === 2 ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-400'
            }`}
          >
            2. SELECT &amp; REVIEW
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
          <span
            className={`px-3 py-1.5 text-[10px] font-black rounded-lg transition-all ${
              wizardStep === 3 ? 'bg-white text-indigo-650 shadow-sm' : 'text-slate-400'
            }`}
          >
            3. PREVIEW &amp; EXPORT
          </span>
        </div>
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          STEP 1 — CONFIGURE OPPORTUNITY
      ════════════════════════════════════════════════════════════════════ */}
      {wizardStep === 1 && (
        <div className="grid grid-cols-12 gap-8">
          <div className="col-span-12 lg:col-span-6 mx-auto w-full">
            <form
              onSubmit={handleCustomize}
              className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-5"
            >
              <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                <Sliders className="w-5 h-5 text-indigo-650" />
                <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400">
                  Opportunity Customization Details
                </h4>
              </div>

              {/* Select Talent Profile */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Select Talent Profile
                </label>
                <TalentSearchSelect
                  employees={employees}
                  selectedId={selectedCandidateId}
                  onSelect={(id) => {
                    setSelectedCandidateId(id);
                    setLastCvError(null);
                  }}
                />

                {selectedEmployee && (
                  <div className="flex items-center gap-2.5 mt-2">
                    {selectedEmployee.avatar && !selectedEmployee.avatar.includes('unsplash.com') ? (
                      <img
                        src={selectedEmployee.avatar}
                        alt={getCvDisplayName(selectedEmployee)}
                        className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 shadow-sm flex items-center justify-center shrink-0">
                        <UserCircle className="w-5 h-5 text-slate-400" />
                      </div>
                    )}
                    <span className="text-[11px] text-slate-500 font-semibold">
                      {selectedEmployee.department} · {selectedEmployee.role}
                    </span>
                  </div>
                )}
              </div>

              <TemplateSelector value={selectedTemplate} onChange={setSelectedTemplate} />

              {/* Mandatory Skills */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Mandatory Required Skills
                </label>
                <input
                  type="text"
                  required
                  value={requiredSkills}
                  onChange={(e) => setRequiredSkills(e.target.value)}
                  placeholder="e.g. PL/SQL, Aurena, Reports, Configuration"
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all text-slate-700 placeholder:text-slate-300"
                />
              </div>

              {/* Preferred Specs / JD */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Customer Requirements / Job Description
                </label>
                <textarea
                  rows={4}
                  value={preferredExp}
                  onChange={(e) => setPreferredExp(e.target.value)}
                  placeholder="Paste the role requirements or job description details..."
                  className="w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-3 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all text-slate-700 leading-relaxed resize-none placeholder:text-slate-300"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={!selectedEmployee || customizingLoading}
                className="mt-4 py-4 bg-gradient-to-r from-sky-600 to-indigo-700 hover:from-sky-500 hover:to-indigo-600 disabled:from-slate-300 disabled:to-slate-400 disabled:cursor-not-allowed disabled:shadow-none text-white rounded-xl font-sans text-sm font-black shadow-lg shadow-sky-600/10 active:scale-[0.98] transition-transform flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <BrainCircuit className="w-5 h-5" />
                <span>Customize CV</span>
              </button>

              <button
                type="button"
                onClick={handleLoadLastCustomizedCv}
                disabled={!selectedEmployee || customizingLoading || loadingLastCv}
                className="py-3.5 bg-white border border-indigo-200 hover:bg-indigo-50 disabled:opacity-50 disabled:cursor-not-allowed text-indigo-700 rounded-xl font-sans text-sm font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                {loadingLastCv ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                <span>{loadingLastCv ? 'Loading Last CV...' : 'Update Last Customized CV'}</span>
              </button>

              {lastCvError && (
                <p className="text-[11px] font-semibold text-rose-600 bg-rose-50 border border-rose-100 rounded-lg px-3 py-2">
                  {lastCvError}
                </p>
              )}

              {suggestion && (suggestionDraft || tailoredCv) && !customizingLoading && (
                <button
                  type="button"
                  onClick={handleBackToSelection}
                  className="py-3.5 bg-white border border-indigo-200 hover:bg-indigo-50 text-indigo-700 rounded-xl font-sans text-sm font-black active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 cursor-pointer"
                >
                  <span>Continue with Draft</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              )}
            </form>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 2 — REVIEW & EDIT
      ════════════════════════════════════════════════════════════════════ */}
      {wizardStep === 2 && (
        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12">
            <button
              type="button"
              onClick={() => setWizardStep(1)}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors cursor-pointer active:scale-95 text-[11px] font-bold"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Back to Parameters</span>
            </button>
          </div>
          {/* ── Left sidebar: context + action buttons (sticky) ─────────── */}
          <div className="col-span-12 lg:col-span-3">
            <div className="sticky top-6 flex flex-col gap-4">
              {/* Candidate info card */}
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 pb-3 border-b border-slate-100">
                  <Sparkles className="w-4 h-4 text-indigo-650" />
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400">
                    Customization Context
                  </h4>
                </div>

                {/* Employee */}
                {selectedEmployee && (
                  <div className="flex items-center gap-3">
                    {selectedEmployee.avatar && !selectedEmployee.avatar.includes('unsplash.com') ? (
                      <img
                        src={selectedEmployee.avatar}
                        alt={getCvDisplayName(selectedEmployee)}
                        className="w-11 h-11 rounded-full object-cover border-2 border-indigo-100 shadow-sm shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-slate-100 border-2 border-indigo-100 shadow-sm flex items-center justify-center shrink-0">
                        <UserCircle className="w-7 h-7 text-slate-400" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate">
                        {getCvDisplayName(selectedEmployee)}
                      </p>
                      <p className="text-[10px] text-slate-500 font-medium truncate">
                        {selectedEmployee.role}
                      </p>
                    </div>
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100">
                  <TemplateSelector value={selectedTemplate} onChange={setSelectedTemplate} />
                </div>

                {/* Live one-page CV preview — reflects the current selection (or, once past that
                    step, the edited content) in real time, so the one-page limit is visible while
                    choosing/adding content rather than discovered later at export time. */}
                {livePreviewCv && (
                  <div className="pt-4 border-t border-slate-100">
                    <OnePagePreview
                      cv={livePreviewCv}
                      id="cv-preview-context-thumb"
                      onOverflowChange={setPreviewOverflowMm}
                    />
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {tailoredCv && !customizingLoading && (
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-5 space-y-3">
                  <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 pb-3 border-b border-slate-100">
                    Actions
                  </h4>

                  {/* Human Verified checkbox */}
                  <div className="flex items-center gap-2 py-1">
                    <input
                      id="generate-human-verified-checkbox"
                      type="checkbox"
                      checked={isHumanVerified}
                      onChange={(e) => setIsHumanVerified(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                    />
                    <label
                      htmlFor="generate-human-verified-checkbox"
                      className="text-xs font-bold text-slate-600 select-none cursor-pointer"
                    >
                      I Verified the Generated Content
                    </label>
                  </div>

                  {/* Apply to CV — also auto-saves */}
                  <button
                    type="button"
                    onClick={handleGoToPreview}
                    disabled={saving || !isHumanVerified || previewOverflowMm > 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-xl text-xs font-black uppercase tracking-wider transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    {saving ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Saving...</span>
                      </>
                    ) : saveSuccess ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Saved! Applying...</span>
                      </>
                    ) : (
                      <>
                        <span>Apply to CV</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-slate-400 text-center leading-relaxed">
                    {previewOverflowMm > 0
                      ? 'Reduce the selected content to fit one page before applying.'
                      : 'Saves your customized CV and generates the template preview.'}
                  </p>
                </div>
              )}

            </div>
          </div>

          {/* ── Right main: loading / error / section editor ─────────────── */}
          <div className="col-span-12 lg:col-span-9">
            {/* Loading state */}
            {customizingLoading && (
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm flex flex-col items-center justify-center py-28 gap-5">
                <div className="relative w-24 h-24 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border border-sky-200 animate-ping opacity-40" />
                  <div className="absolute inset-2 rounded-full border-2 border-transparent border-t-sky-500 border-r-indigo-500 animate-spin" />
                  <div className="absolute inset-4 rounded-full border border-dashed border-indigo-300 animate-[spin_3s_linear_infinite_reverse]" />
                  <div className="relative w-12 h-12 rounded-2xl bg-slate-900 shadow-lg shadow-indigo-500/20 flex items-center justify-center animate-pulse">
                    <Image
                      src="/images/seb-logo-2.png"
                      alt="SEBSA"
                      width={34}
                      height={34}
                      className="object-contain"
                      priority
                    />
                  </div>
                </div>
                <div className="text-center space-y-1">
                  <p className="text-sm font-black text-slate-800">
                    Analyzing Profile…
                  </p>
                  <p className="text-xs text-slate-500 max-w-xs leading-relaxed">
                    Reviewing{' '}
                    <span className="font-bold text-slate-700">{selectedEmployee?.name}</span>'s
                    existing profile against the requirements provided
                  </p>
                </div>
              </div>
            )}

            {/* Error state */}
            {customizingError && !customizingLoading && (
              <div className="bg-white rounded-2xl border border-rose-200 shadow-sm flex flex-col items-center justify-center py-20 gap-4 text-center px-8">
                <AlertCircle className="w-10 h-10 text-rose-400" />
                <div className="space-y-1">
                  <p className="text-sm font-black text-rose-700">Customization Failed</p>
                  <p className="text-xs text-slate-500 max-w-sm leading-relaxed">
                    {customizingError}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWizardStep(1)}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Back to Parameters
                </button>
              </div>
            )}

            {/* Suggestion selector — shown once the AI has flagged relevant existing content,
                before anything is applied to a CV */}
            {suggestion && suggestionDraft && !tailoredCv && !customizingLoading && !customizingError && (
              <CvSuggestionSelector
                suggestion={suggestion}
                draft={suggestionDraft}
                onDraftChange={setSuggestionDraft}
                onApply={handleSelectionApply}
                applying={saving}
                source={restoredCvBase ? 'saved' : 'ai'}
                pageLimitExceeded={previewOverflowMm > 0}
              />
            )}

            {/* Section editor — shown once the user has continued past selection, for a light
                wording pass over only the content they picked */}
            {tailoredCv && !customizingLoading && !customizingError && (
              <>
                {/* Context banner */}
                <div className="mb-4 px-5 py-3.5 bg-indigo-50 border border-indigo-100 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-indigo-800">
                      Built From Your Selection — Review Wording Before Saving
                    </p>
                    <p className="text-[10px] text-indigo-600 font-medium mt-0.5">
                      Only the content you selected is included. Expand collapsed sections to see more.
                    </p>
                  </div>
                  {saveSuccess && (
                    <div className="flex items-center gap-1.5 text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-lg text-[10px] font-bold shrink-0">
                      <CheckCircle2 className="w-3 h-3" />
                      Saved to database
                    </div>
                  )}
                </div>

                <CvSectionEditor cv={tailoredCv} onChange={setTailoredCv} />
              </>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STEP 3 — PREVIEW & EXPORT
      ════════════════════════════════════════════════════════════════════ */}
      {wizardStep === 3 && tailoredCv && customizedPreviewCv && (
        <div className="flex flex-col gap-6">
          {/* Action toolbar */}
          <div className="bg-white p-4 rounded-xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={handleBackToSelection}
                className="p-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-lg transition-colors cursor-pointer active:scale-95"
                aria-label="Back to Select and Preview"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div>
                <h4 className="text-sm font-black text-slate-800">
                  Original and Customized CV Preview
                </h4>
                <p className="text-[11px] text-slate-450 font-medium">
                  Compare the complete employee profile with the selected customer-specific content.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button type="button" onClick={() => handleDownloadPdf(false)} className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors cursor-pointer shadow-sm">
                <Download className="w-4 h-4 text-rose-500" /><span>Download CV</span>
              </button>
              <button type="button" onClick={() => handleDownloadPdf(true)} className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 text-white font-bold rounded-xl text-xs hover:bg-slate-900 transition-colors cursor-pointer shadow-sm">
                <Download className="w-4 h-4" /><span>Anonymous CV Download</span>
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-6 items-start ${originalProfileCv ? 'xl:grid-cols-2' : 'max-w-[900px] mx-auto w-full'}`}>
            {originalProfileCv && <section className="min-w-0 space-y-3">
              <div className="px-1">
                <h5 className="text-xs font-black uppercase tracking-widest text-slate-600">
                  Complete Profile CV
                </h5>
                <p className="text-[11px] text-slate-400 mt-1">
                  Original overview, experience, projects, academics, and certifications.
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 shadow-inner flex justify-center">
                <CvPreviewTemplate cv={originalProfileCv} id="original-cv-preview-root" />
              </div>
            </section>}

            <section className="min-w-0 space-y-3">
              <div className="px-1">
                <h5 className="text-xs font-black uppercase tracking-widest text-indigo-700">
                  Customized CV
                </h5>
                <p className="text-[11px] text-slate-400 mt-1">
                  Contains the exact selected and edited content saved for this customized CV.
                </p>
              </div>
              <div className="bg-slate-50 p-4 rounded-2xl border border-indigo-100 shadow-inner flex justify-center">
                <CvPreviewTemplate
                  cv={customizedPreviewCv}
                  id="customized-cv-preview-display"
                />
              </div>
            </section>
          </div>

          {/* Hidden, full-width, untransformed copy of the real tailoredCv — this is what
              lib/cvExport.ts actually screenshots, not either comparison panel above. Keeping the
              real export target out of the half-width comparison grid is what keeps the exported
              PDF at full resolution and correctly paginated regardless of how the on-screen
              comparison is laid out — same fix already used for this exact class of bug in
              EmployeeProfileClient.tsx's hidden capture copy. */}
          <div style={{ position: 'fixed', top: 0, left: '-10000px', zIndex: -1 }} aria-hidden="true">
            <CvPreviewTemplate
              cv={tailoredCv}
            />
            <CvPreviewTemplate
              cv={anonymizeTailoredCv(tailoredCv)}
              id="anonymous-generated-cv-preview-root"
            />
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
