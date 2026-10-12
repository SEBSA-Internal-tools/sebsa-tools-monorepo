'use client';

import { pickEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';
import EmployeeDetailTabs from '@/app/components/EmployeeDetailTabs';


import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import { useData } from '../../context/DataContext';
import { getDepartmentsAction, uploadProfilePictureAction } from './actions';
import { extractText } from '@/lib/parsing/extractClientText';
import { useRoleGate } from '@/lib/useRoleGate';
import { isReviewerOrAbove } from '@/lib/roles';
import { ProjectSkillsInput } from '@/app/components/CvEntrySections';
import {
  emptyCvProfile,
  type CvProfile,
  type CvExperienceEntry,
  type CvAcademicEntry,
  type CvCertificationEntry,
} from '@/lib/cvTypes';
import {
  CloudUpload,
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  Trash2,
  ArrowRight,
  Plus,
  Minus,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Award,
  Layers,
  ImageIcon,
  UserCircle2,
} from 'lucide-react';
import { toTitleCase } from '@/lib/text';

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadStatus = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionTitle({ icon: Icon, children }: { icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <div className="w-7 h-7 bg-indigo-50 rounded-lg flex items-center justify-center">
        <Icon className="w-4 h-4 text-indigo-600" />
      </div>
      <h4 className="text-xs font-black uppercase tracking-widest text-slate-500">{children}</h4>
    </div>
  );
}

function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{children}</label>
      {hint && <span className="text-[10px] text-slate-400">{hint}</span>}
    </div>
  );
}

const INPUT_CLS =
  'w-full bg-slate-50 border border-slate-200/80 rounded-xl px-4 py-2.5 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all text-slate-700 placeholder:text-slate-300';

const TEXTAREA_CLS = INPUT_CLS + ' resize-none leading-relaxed';

const GHOST_BTN =
  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold border transition-all cursor-pointer';

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UploadPage() {
  const router = useRouter();
  const { addEmployee } = useData();
  // Employee/CV Reviewer have no profile-creation permission (docs/04-rbac-security.md §2) —
  // this is the UX guard; RLS + createEmployeeAction's own role check are the real boundary.
  useRoleGate(isReviewerOrAbove);

  // ── CV File state ─────────────────────────────────────────────────────────
  const [isDragActive, setIsDragActive] = useState(false);
  const [droppedFile, setDroppedFile] = useState<{ name: string; size: string } | null>(null);
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Profile Image state ───────────────────────────────────────────────────
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ── Parsed CV profile (editable) ─────────────────────────────────────────
  const [profile, setProfile] = useState<CvProfile>(emptyCvProfile());

  // ── Extra flat fields required by Supabase that are not in CvProfile ──────
  const [email, setEmail] = useState('');
  const [details, setDetails] = useState<EmployeeDetails>({});
  const [department, setDepartment] = useState('');

  // ── Departments loaded from DB ────────────────────────────────────────────
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(true);

  useEffect(() => {
    getDepartmentsAction()
      .then((rows) => {
        setDepartments(rows);
        if (rows.length > 0) setDepartment(rows[0].name);
      })
      .catch(() => {
        // Silently ignore — dropdown will be empty; user can type manually
      })
      .finally(() => setDepartmentsLoading(false));
  }, []);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ─── File handling ─────────────────────────────────────────────────────────

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const processFile = useCallback(async (file: File) => {
    const sizeStr = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    setDroppedFile({ name: file.name, size: sizeStr });
    setStatus('extracting');
    setErrorMsg(null);
    setSubmitError(null);

    let rawText: string;
    try {
      rawText = await extractText(file);
    } catch (err) {
      console.error('Text extraction failed:', err);
      setStatus('error');
      setErrorMsg('Could not read the file. Please try a different format.');
      return;
    }

    setStatus('analyzing');

    try {
      const res = await fetch('/api/parse-cv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: rawText }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `Server error ${res.status}`);
      }

      const parsed = (await res.json()) as CvProfile;
      setProfile(parsed);
      setStatus('done');
    } catch (err) {
      console.error('CV parsing failed:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'AI parsing failed. Please try again.');
    }
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  // ─── Form helpers ──────────────────────────────────────────────────────────

  const updateField = <K extends keyof CvProfile>(key: K, value: CvProfile[K]) =>
    setProfile((p) => ({ ...p, [key]: value }));

  // Experience
  const addExperience = () =>
    updateField('experience', [...profile.experience, { position: '', company: '', period: '', tasks: [''] }]);
  const removeExperience = (i: number) =>
    updateField('experience', profile.experience.filter((_, idx) => idx !== i));
  const updateExperience = (i: number, field: keyof CvExperienceEntry, value: string | string[]) =>
    updateField(
      'experience',
      profile.experience.map((e, idx) => (idx === i ? { ...e, [field]: value } : e))
    );
  const addTask = (expIdx: number) =>
    updateExperience(expIdx, 'tasks', [...profile.experience[expIdx].tasks, '']);
  const removeTask = (expIdx: number, taskIdx: number) =>
    updateExperience(
      expIdx,
      'tasks',
      profile.experience[expIdx].tasks.filter((_, i) => i !== taskIdx)
    );
  const updateTask = (expIdx: number, taskIdx: number, value: string) =>
    updateExperience(
      expIdx,
      'tasks',
      profile.experience[expIdx].tasks.map((t, i) => (i === taskIdx ? value : t))
    );

  // Academic
  const addAcademic = () =>
    updateField('academic', [...profile.academic, { qualification: '', institution: '', period: '' }]);
  const removeAcademic = (i: number) =>
    updateField('academic', profile.academic.filter((_, idx) => idx !== i));
  const updateAcademic = (i: number, field: keyof CvAcademicEntry, value: string) =>
    updateField('academic', profile.academic.map((e, idx) => (idx === i ? { ...e, [field]: value } : e)));

  // Special Projects
  const addProject = () =>
    updateField('specialProjects', [...profile.specialProjects, { title: '', brief: '', skills: [] }]);
  const removeProject = (i: number) =>
    updateField('specialProjects', profile.specialProjects.filter((_, idx) => idx !== i));
  const updateProject = (i: number, field: 'title' | 'brief', value: string) =>
    updateField(
      'specialProjects',
      profile.specialProjects.map((p, idx) => (idx === i ? { ...p, [field]: value } : p))
    );
  const updateProjectSkills = (i: number, skills: string[]) =>
    updateField(
      'specialProjects',
      profile.specialProjects.map((p, idx) => (idx === i ? { ...p, skills } : p))
    );

  // Certifications
  const addCertification = () =>
    updateField('certifications', [...profile.certifications, { name: '', issuer: '', year: '' }]);
  const removeCertification = (i: number) =>
    updateField('certifications', profile.certifications.filter((_, idx) => idx !== i));
  const updateCertification = (i: number, field: keyof CvCertificationEntry, value: string) =>
    updateField(
      'certifications',
      profile.certifications.map((c, idx) => (idx === i ? { ...c, [field]: value } : c))
    );

  // ─── Profile Image handlers ────────────────────────────────────────────────

  const processImageFile = useCallback((file: File) => {
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!validTypes.includes(file.type)) {
      setImageUploadError('Please upload a JPG, PNG, WEBP, or GIF image.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setImageUploadError('Image must be smaller than 5 MB.');
      return;
    }
    setImageUploadError(null);
    setProfileImageFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setProfileImagePreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }, []);

  const handleImageDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsImageDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsImageDragActive(false);
    if (e.dataTransfer.files?.[0]) processImageFile(e.dataTransfer.files[0]);
  };

  const handleImageInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processImageFile(e.target.files[0]);
  };

  // ─── Submit ────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      // Upload profile image first if provided
      let avatarUrl: string | undefined;
      if (profileImageFile) {
        const imgFormData = new FormData();
        imgFormData.append('file', profileImageFile);
        avatarUrl = await uploadProfilePictureAction(imgFormData);
      }

      await addEmployee({
        ...details,
        name: profile.name,
        email,
        role: profile.currentPosition,
        department,
        skills: [],
        cvProfile: profile,
        avatarUrl,
      });
      router.push('/repository');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to import employee.');
      setIsSubmitting(false);
    }
  };

  // ─── Discard ───────────────────────────────────────────────────────────────

  const handleDiscard = () => {
    setDroppedFile(null);
    setStatus('idle');
    setErrorMsg(null);
    setProfile(emptyCvProfile());
    setDetails({});
    setEmail('');
    setSubmitError(null);
    setProfileImageFile(null);
    setProfileImagePreview(null);
    setImageUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  // ─── Status helpers ────────────────────────────────────────────────────────

  const statusLabel: Record<UploadStatus, string> = {
    idle: '',
    extracting: 'Extracting text…',
    analyzing: 'Analyzing CV with Gemini AI…',
    done: 'Parsing complete — review and edit below.',
    error: 'An error occurred.',
  };

  const isProcessing = status === 'extracting' || status === 'analyzing';

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <PageWrapper className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
          Create Profile
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          Create a new employee profile by uploading their CV and profile photo. AI automatically extracts and structures experiences, academic history, projects, certifications, and skills.
        </p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* ── Left Column — Drop zone & status ── */}
        <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col">
            <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400 mb-4">
              Select Document
            </h4>

            {/* Drop zone */}
            <div
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={() => setIsDragActive(false)}
              onDrop={handleDrop}
              onClick={status === 'idle' ? () => fileInputRef.current?.click() : undefined}
              className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[200px] ${
                isDragActive
                  ? 'border-indigo-500 bg-indigo-50/30 cursor-copy'
                  : status !== 'idle'
                  ? 'border-slate-200 bg-slate-50/50 cursor-default'
                  : 'border-slate-300 hover:border-indigo-400 bg-slate-50/20 hover:bg-indigo-50/10 cursor-pointer'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept=".pdf,.docx,.txt"
                className="hidden"
              />

              <div
                className={`w-14 h-14 rounded-full flex items-center justify-center mb-4 transition-colors ${
                  isDragActive ? 'bg-indigo-100 text-indigo-700' : 'bg-indigo-50 text-indigo-600'
                }`}
              >
                <CloudUpload className="w-7 h-7" />
              </div>
              <h5 className="text-sm font-bold text-slate-800 mb-1">
                {isDragActive ? 'Drop it here!' : 'Drag & drop candidate CV'}
              </h5>
              <p className="text-xs text-slate-400 max-w-[200px] leading-relaxed">
                or{' '}
                <span className="text-indigo-600 font-semibold underline">browse local files</span>.
                Supports PDF, DOCX, TXT up to 10 MB.
              </p>
            </div>

            {/* File & status widget */}
            {droppedFile && (
              <div className="mt-5 p-4 border border-slate-200 rounded-xl bg-slate-50/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-indigo-600 shrink-0 shadow-sm">
                    <FileText className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-800 truncate">{droppedFile.name}</p>
                    <p className="text-[10px] text-slate-400 font-semibold mt-0.5">{droppedFile.size}</p>
                  </div>
                </div>

                {/* Status row */}
                <div
                  className={`flex items-center gap-2 text-[11px] font-semibold py-0.5 ${
                    status === 'done'
                      ? 'text-emerald-600'
                      : status === 'error'
                      ? 'text-rose-600'
                      : 'text-indigo-600'
                  }`}
                >
                  {isProcessing && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
                  {status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                  {status === 'error' && <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
                  <span>{errorMsg ?? statusLabel[status]}</span>
                  {status !== 'idle' && (
                    <span
                      className={`ml-auto text-[9px] font-black uppercase px-2 py-0.5 rounded ${
                        status === 'done'
                          ? 'bg-emerald-100 text-emerald-700'
                          : status === 'error'
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-indigo-100 text-indigo-700'
                      }`}
                    >
                      {status === 'extracting' ? 'Reading' : status === 'analyzing' ? 'AI' : status === 'done' ? 'Ready' : 'Error'}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ── Profile Image Upload ── */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
            <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
              <UserCircle2 className="w-4 h-4 text-indigo-500" />
              Profile Photo
              <span className="text-rose-500 font-bold normal-case tracking-normal font-sans text-[10px] bg-rose-50 border border-rose-100/60 px-2 py-0.5 rounded-full ml-1">Required</span>
            </h4>

            {profileImagePreview ? (
              <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <img
                    src={profileImagePreview}
                    alt="Profile preview"
                    className="w-28 h-28 rounded-full object-cover border-4 border-indigo-100 shadow-md"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setProfileImageFile(null);
                      setProfileImagePreview(null);
                      if (imageInputRef.current) imageInputRef.current.value = '';
                    }}
                    className="absolute -top-1 -right-1 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors"
                  >
                    ×
                  </button>
                </div>
                <p className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Photo ready to upload
                </p>
              </div>
            ) : (
              <div
                onDragEnter={handleImageDrag}
                onDragOver={handleImageDrag}
                onDragLeave={() => setIsImageDragActive(false)}
                onDrop={handleImageDrop}
                onClick={() => imageInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer ${
                  isImageDragActive
                    ? 'border-indigo-500 bg-indigo-50/30'
                    : 'border-slate-300 hover:border-indigo-400 bg-slate-50/20 hover:bg-indigo-50/10'
                }`}
              >
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  className="hidden"
                  onChange={handleImageInputChange}
                />
                <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-500 flex items-center justify-center mb-3">
                  <ImageIcon className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-600">
                  {isImageDragActive ? 'Drop photo here' : 'Drag & drop or click to upload'}
                </p>
                <p className="text-[10px] text-slate-400 mt-1">JPG, PNG, WEBP up to 5 MB</p>
              </div>
            )}

            {imageUploadError && (
              <p className="mt-2 text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                <AlertCircle className="w-3.5 h-3.5" />
                {imageUploadError}
              </p>
            )}
          </div>


        </div>

        {/* ── Right Column — Editable form ── */}
        <div className="col-span-12 lg:col-span-7">
          <form
            onSubmit={handleSubmit}
            className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-8"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400">
                Candidate Information (AI Parsed Draft)
              </h4>
              {status === 'done' && (
                <div className="flex items-center gap-1 text-[11px] font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
                  <Sparkles className="w-3 h-3 fill-indigo-400/20" />
                  <span>Gemini AI Parsed</span>
                </div>
              )}
            </div>

            <fieldset disabled={status !== 'done' || departmentsLoading} className="min-w-0">
            <EmployeeDetailTabs value={{ ...details, name: profile.name, role: profile.currentPosition, department, email }} departments={departments} requireCompleteOverview
              onChange={next => { setDetails(pickEmployeeDetails(next)); setProfile(p => ({ ...p, name: next.name, currentPosition: next.role })); setDepartment(next.department); setEmail(next.email); }}>
            <div className="space-y-8">
            {/* ── Objective ── */}
            <div>
              <FieldLabel>Objective / Professional Summary</FieldLabel>
              <textarea
                rows={3}
                placeholder="A brief statement of career goals and what they bring to the role..."
                value={profile.summary}
                onChange={(e) => updateField('summary', e.target.value)}
                disabled={status !== 'done'}
                className={TEXTAREA_CLS}
              />
            </div>

            {/* ── Experience ── */}
            <div>
              <SectionTitle icon={Briefcase}>Work Experience</SectionTitle>
              <div className="space-y-5">
                {profile.experience.map((exp, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-indigo-500">
                        Position {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeExperience(i)}
                        className={`${GHOST_BTN} border-rose-200 text-rose-500 hover:bg-rose-50`}
                      >
                        <Minus className="w-3 h-3" /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <FieldLabel>Position / Title</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. Software Engineer"
                          value={exp.position}
                          onBlur={(e) => updateExperience(i, 'position', toTitleCase(e.target.value))}
                          onChange={(e) => updateExperience(i, 'position', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <FieldLabel>Company</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. Google"
                          value={exp.company}
                          onChange={(e) => updateExperience(i, 'company', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <FieldLabel>Period</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. Jan 2020 – Present"
                          value={exp.period}
                          onChange={(e) => updateExperience(i, 'period', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>
                    {/* Tasks */}
                    <div>
                      <FieldLabel hint={`${exp.tasks.length} task(s)`}>Responsibilities / Achievements</FieldLabel>
                      <div className="space-y-2">
                        {exp.tasks.map((task, ti) => (
                          <div key={ti} className="flex items-start gap-2">
                            <span className="text-indigo-400 mt-2.5 text-[10px] font-black shrink-0">▸</span>
                            <input
                              type="text"
                              value={task}
                              placeholder="e.g. Led a team of 5 engineers…"
                              onChange={(e) => updateTask(i, ti, e.target.value)}
                              className={INPUT_CLS + ' flex-1'}
                            />
                            <button
                              type="button"
                              onClick={() => removeTask(i, ti)}
                              disabled={exp.tasks.length <= 1}
                              className="mt-1.5 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-colors disabled:opacity-30"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addTask(i)}
                          className={`${GHOST_BTN} border-indigo-200 text-indigo-500 hover:bg-indigo-50 mt-1`}
                        >
                          <Plus className="w-3 h-3" /> Add Task
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addExperience}
                  className={`${GHOST_BTN} border-slate-300 text-slate-500 hover:bg-slate-50`}
                >
                  <Plus className="w-3 h-3" /> Add Experience
                </button>
              </div>
            </div>

            {/* ── Academic ── */}
            <div>
              <SectionTitle icon={GraduationCap}>Academic History</SectionTitle>
              <div className="space-y-3">
                {profile.academic.map((acad, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-violet-500">
                        Entry {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeAcademic(i)}
                        className={`${GHOST_BTN} border-rose-200 text-rose-500 hover:bg-rose-50`}
                      >
                        <Minus className="w-3 h-3" /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <FieldLabel>Qualification</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. B.Sc. Computer Science"
                          value={acad.qualification}
                          onChange={(e) => updateAcademic(i, 'qualification', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div className="sm:col-span-1">
                        <FieldLabel>Institution</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. MIT"
                          value={acad.institution}
                          onChange={(e) => updateAcademic(i, 'institution', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <FieldLabel>Period</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. 2014 – 2018"
                          value={acad.period}
                          onChange={(e) => updateAcademic(i, 'period', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addAcademic}
                  className={`${GHOST_BTN} border-slate-300 text-slate-500 hover:bg-slate-50`}
                >
                  <Plus className="w-3 h-3" /> Add Academic Entry
                </button>
              </div>
            </div>

            {/* ── Special Projects ── */}
            <div>
              <SectionTitle icon={Layers}>Special Projects</SectionTitle>
              <div className="space-y-3">
                {profile.specialProjects.map((proj, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-sky-500">
                        Project {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeProject(i)}
                        className={`${GHOST_BTN} border-rose-200 text-rose-500 hover:bg-rose-50`}
                      >
                        <Minus className="w-3 h-3" /> Remove
                      </button>
                    </div>
                    <div>
                      <FieldLabel>Project Title</FieldLabel>
                      <input
                        type="text"
                        placeholder="e.g. AI-Powered Recommendation Engine"
                        value={proj.title}
                        onChange={(e) => updateProject(i, 'title', e.target.value)}
                        className={INPUT_CLS}
                      />
                    </div>
                    <div>
                      <FieldLabel>Brief Description</FieldLabel>
                      <textarea
                        rows={2}
                        placeholder="e.g. Built a real-time product recommendation system using collaborative filtering…"
                        value={proj.brief}
                        onChange={(e) => updateProject(i, 'brief', e.target.value)}
                        className={TEXTAREA_CLS}
                      />
                    </div>
                    <ProjectSkillsInput
                      skills={proj.skills ?? []}
                      onChange={(skills) => updateProjectSkills(i, skills)}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addProject}
                  className={`${GHOST_BTN} border-slate-300 text-slate-500 hover:bg-slate-50`}
                >
                  <Plus className="w-3 h-3" /> Add Project
                </button>
              </div>
            </div>

            {/* ── Certifications ── */}
            <div>
              <SectionTitle icon={Award}>Certifications</SectionTitle>
              <div className="space-y-3">
                {profile.certifications.map((cert, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-4 bg-slate-50/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">
                        Cert {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeCertification(i)}
                        className={`${GHOST_BTN} border-rose-200 text-rose-500 hover:bg-rose-50`}
                      >
                        <Minus className="w-3 h-3" /> Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="sm:col-span-1">
                        <FieldLabel>Certification Name</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. AWS Certified Solutions Architect"
                          value={cert.name}
                          onChange={(e) => updateCertification(i, 'name', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <FieldLabel>Issuer</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. Amazon Web Services"
                          value={cert.issuer}
                          onChange={(e) => updateCertification(i, 'issuer', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                      <div>
                        <FieldLabel>Year</FieldLabel>
                        <input
                          type="text"
                          placeholder="e.g. 2023"
                          value={cert.year}
                          onChange={(e) => updateCertification(i, 'year', e.target.value)}
                          className={INPUT_CLS}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addCertification}
                  className={`${GHOST_BTN} border-slate-300 text-slate-500 hover:bg-slate-50`}
                >
                  <Plus className="w-3 h-3" /> Add Certification
                </button>
              </div>
            </div>

            </div>
            </EmployeeDetailTabs>
            </fieldset>

            {/* ── Actions ── */}
            <div className="pt-4 border-t border-slate-100">
              {submitError && (
                <div className="mb-4 flex items-center gap-2 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {submitError}
                </div>
              )}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleDiscard}
                  disabled={status === 'idle'}
                  className="flex items-center gap-1.5 px-5 py-3 border border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-500 hover:text-slate-700 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  Discard Draft
                </button>

                <button
                  type="submit"
                  disabled={status !== 'done' || !profileImageFile || isSubmitting}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-6 py-3.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                  title={!profileImageFile ? "Profile Photo is required" : status !== 'done' ? "Please upload and parse a CV document first" : "Create Profile"}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Creating Profile…</span>
                    </>
                  ) : (
                    <>
                      <span>Create Profile</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>
    </PageWrapper>
  );
}
