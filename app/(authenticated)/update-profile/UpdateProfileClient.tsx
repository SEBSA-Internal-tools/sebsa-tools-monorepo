'use client';

import EmployeeDetailTabs from '@/app/components/EmployeeDetailTabs';
import { pickEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';

import React, { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import { uploadProfilePictureAction } from '../upload/actions';
import { getEmployeeDetailsAction, updateEmployeeAction } from './actions';
import { ProjectSkillsInput } from '@/app/components/CvEntrySections';
import { toTitleCase } from '@/lib/text';
import {
  emptyCvProfile,
  type CvProfile,
  type CvExperienceEntry,
  type CvAcademicEntry,
  type CvCertificationEntry,
} from '@/lib/cvTypes';
import type { Employee, UpdateEmployeeInput } from '@/types/domain';
import {
  CloudUpload,
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  Save,
  Plus,
  Minus,
  AlertCircle,
  GraduationCap,
  Briefcase,
  Award,
  Layers,
  ImageIcon,
  UserCircle2,
  Search,
  ArrowLeft,
  ChevronRight,
  UserCircle,
  X,
} from 'lucide-react';

// ─── Sub-components (consistent with upload/page.tsx) ───────────────────────────

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

// ─── Text extraction helpers ──────────────────────────────────────────────────

async function extractTextFromTxt(file: File): Promise<string> {
  return file.text();
}

async function extractTextFromDocx(file: File): Promise<string> {
  const mammoth = await import('mammoth');
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.extractRawText({ arrayBuffer });
  return result.value;
}

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

  const arrayBuffer = await file.arrayBuffer();
  const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages: string[] = [];

  for (let i = 1; i <= pdfDoc.numPages; i++) {
    const page = await pdfDoc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((item: any) => item.str as string)
      .join(' ');
    pages.push(pageText);
  }

  return pages.join('\n');
}

async function extractText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractTextFromPdf(file);
  if (name.endsWith('.docx')) return extractTextFromDocx(file);
  return extractTextFromTxt(file);
}

// ─── Main Client Component ────────────────────────────────────────────────────

interface UpdateProfileClientProps {
  initialEmployees: Employee[];
  departments: { id: string; name: string }[];
  /** Pre-selects an employee when arriving from their profile page's edit-pencil icon, instead
   *  of requiring the Admin to re-pick them from the dropdown below. */
  initialId?: string;
}

type CvUploadStatus = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

export default function UpdateProfileClient({
  initialEmployees,
  departments,
  initialId,
}: UpdateProfileClientProps) {
  const router = useRouter();

  // Selected employee selection
  const [selectedId, setSelectedId] = useState<string>(initialId ?? '');
  const [loadingProfile, setLoadingProfile] = useState<boolean>(false);
  const [activeProfile, setActiveProfile] = useState<Employee | null>(null);

  // Search filter for the employee picker list (shown before an employee is selected)
  const [searchTerm, setSearchTerm] = useState('');
  const filteredEmployees = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return initialEmployees;
    return initialEmployees.filter(
      (emp) =>
        emp.name.toLowerCase().includes(term) ||
        emp.email.toLowerCase().includes(term) ||
        emp.role.toLowerCase().includes(term) ||
        emp.department.toLowerCase().includes(term)
    );
  }, [initialEmployees, searchTerm]);

  // Form editable states
  const [profile, setProfile] = useState<CvProfile>(emptyCvProfile());
  const [details, setDetails] = useState<EmployeeDetails>({});
  const [email, setEmail] = useState('');
  const [department, setDepartment] = useState('');

  // Profile photo states
  const [profileImageFile, setProfileImageFile] = useState<File | null>(null);
  const [profileImagePreview, setProfileImagePreview] = useState<string | null>(null);
  const [isImageDragActive, setIsImageDragActive] = useState(false);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // New CV upload states (for optional replacement)
  const [cvStatus, setCvStatus] = useState<CvUploadStatus>('idle');
  const [cvErrorMsg, setCvErrorMsg] = useState<string | null>(null);
  const [cvDroppedFile, setCvDroppedFile] = useState<{ name: string; size: string } | null>(null);
  const [isCvDragActive, setIsCvDragActive] = useState(false);
  const cvFileInputRef = useRef<HTMLInputElement>(null);

  // Save states
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Parsed CV state for verification
  const [parsedCv, setParsedCv] = useState<CvProfile | null>(null);
  const [isHumanVerified, setIsHumanVerified] = useState<boolean>(false);

  // Snapshot of {profile, email, department} as-loaded, so the Save button can stay disabled
  // until the Admin actually changes something rather than being enabled by default.
  const [initialSnapshot, setInitialSnapshot] = useState<string>('');
  const isDirty =
    profileImageFile !== null || JSON.stringify({ profile, email, department, details }) !== initialSnapshot;

  // Load selected employee details
  useEffect(() => {
    setSuccessMessage(null);
    setParsedCv(null);
    setIsHumanVerified(false);

    if (!selectedId) {
      setActiveProfile(null);
      setProfile(emptyCvProfile());
      setEmail('');
      setProfileImagePreview(null);
      setProfileImageFile(null);
      setInitialSnapshot('');
      return;
    }

    const loadDetails = async () => {
      try {
        setLoadingProfile(true);
        const detailedEmp = await getEmployeeDetailsAction(selectedId);
        if (detailedEmp) {
          setActiveProfile(detailedEmp);
          const loadedProfile: CvProfile = {
            name: detailedEmp.name,
            currentPosition: detailedEmp.role,
            summary: detailedEmp.summary ?? '',
            experience: detailedEmp.cvExperience || [],
            academic: detailedEmp.cvAcademic || [],
            specialProjects: detailedEmp.specialProjects || [],
            certifications: detailedEmp.cvCertifications || [],
          };
          setProfile(loadedProfile);
          setDetails(pickEmployeeDetails(detailedEmp));
          setEmail(detailedEmp.email);
          setDepartment(detailedEmp.department);
          setProfileImagePreview(detailedEmp.avatar);
          setProfileImageFile(null); // Keep null to flag no changes yet
          setInitialSnapshot(
            JSON.stringify({ profile: loadedProfile, email: detailedEmp.email, department: detailedEmp.department, details: pickEmployeeDetails(detailedEmp) })
          );
        }
      } catch (err) {
        console.error('Failed to load profile details:', err);
      } finally {
        setLoadingProfile(false);
      }
    };

    loadDetails();
  }, [selectedId]);

  // ─── CV File upload processing ──────────────────────────────────────────────

  const handleCvDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCvDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const processCvFile = useCallback(async (file: File) => {
    const sizeStr = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    setCvDroppedFile({ name: file.name, size: sizeStr });
    setCvStatus('extracting');
    setCvErrorMsg(null);
    setSuccessMessage(null);
    setParsedCv(null);
    setIsHumanVerified(false);

    let rawText: string;
    try {
      rawText = await extractText(file);
    } catch (err) {
      console.error('Text extraction failed:', err);
      setCvStatus('error');
      setCvErrorMsg('Could not read the file. Please try a different format.');
      return;
    }

    setCvStatus('analyzing');

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
      setParsedCv(parsed);
      setIsHumanVerified(false);
      setCvStatus('done');
    } catch (err) {
      console.error('CV parsing failed:', err);
      setCvStatus('error');
      setCvErrorMsg(err instanceof Error ? err.message : 'AI parsing failed. Please try again.');
    }
  }, []);

  const handleApplyCv = useCallback(() => {
    if (!parsedCv) return;
    setProfile(parsedCv);
    setSuccessMessage(null);
    setSaveError(null);
    setParsedCv(null);
    setIsHumanVerified(false);
  }, [parsedCv]);

  const handleCvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsCvDragActive(false);
    if (e.dataTransfer.files?.[0]) processCvFile(e.dataTransfer.files[0]);
  };

  const handleCvFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processCvFile(e.target.files[0]);
  };

  // ─── Image Photo Handling ──────────────────────────────────────────────────

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

  // ─── Form Mutators ──────────────────────────────────────────────────────────

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

  // ─── Submit Form ───────────────────────────────────────────────────────────

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeProfile) return;

    setSaveError(null);
    setSuccessMessage(null);
    setIsSaving(true);

    try {
      let avatarUrl: string | undefined;
      // Upload new image if selected
      if (profileImageFile) {
        const imgFormData = new FormData();
        imgFormData.append('file', profileImageFile);
        avatarUrl = await uploadProfilePictureAction(imgFormData);
      }

      const input: UpdateEmployeeInput = {
        ...details,
        name: profile.name,
        email,
        role: profile.currentPosition,
        department,
        summary: profile.summary,
        skills: [],
        cvExperience: profile.experience,
        cvAcademic: profile.academic,
        specialProjects: profile.specialProjects,
        cvCertifications: profile.certifications,
        avatarUrl, // Will be undefined if photo is not replaced
      };

      await updateEmployeeAction(activeProfile.rowId, input);
      setSuccessMessage('Profile successfully updated.');

      // Refresh form with the newly saved details silently
      const detailedEmp = await getEmployeeDetailsAction(selectedId);
      if (detailedEmp) {
        setActiveProfile(detailedEmp);
        const loadedProfile: CvProfile = {
          name: detailedEmp.name,
          currentPosition: detailedEmp.role,
          summary: detailedEmp.summary ?? '',
          experience: detailedEmp.cvExperience || [],
          academic: detailedEmp.cvAcademic || [],
          specialProjects: detailedEmp.specialProjects || [],
          certifications: detailedEmp.cvCertifications || [],
        };
        setProfile(loadedProfile);
          setDetails(pickEmployeeDetails(detailedEmp));
        setEmail(detailedEmp.email);
        setDepartment(detailedEmp.department);
        setProfileImagePreview(detailedEmp.avatar);
        setProfileImageFile(null); // Keep null to flag no changes yet
        setInitialSnapshot(
          JSON.stringify({ profile: loadedProfile, email: detailedEmp.email, department: detailedEmp.department, details: pickEmployeeDetails(detailedEmp) })
        );
      }
      setIsSaving(false);
      router.refresh();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to update employee profile.');
      setIsSaving(false);
    }
  };

  const handleBackToList = () => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
        return;
      }
    }
    setSelectedId('');
    setSaveError(null);
    setSuccessMessage(null);
  };

  const handleCancel = async () => {
    if (isDirty) {
      if (!confirm('You have unsaved changes. Are you sure you want to discard them?')) {
        return;
      }
    }
    setSaveError(null);
    setSuccessMessage(null);
    setParsedCv(null);
    setIsHumanVerified(false);

    try {
      setLoadingProfile(true);
      const detailedEmp = await getEmployeeDetailsAction(selectedId);
      if (detailedEmp) {
        setActiveProfile(detailedEmp);
        const loadedProfile: CvProfile = {
          name: detailedEmp.name,
          currentPosition: detailedEmp.role,
          summary: detailedEmp.summary ?? '',
          experience: detailedEmp.cvExperience || [],
          academic: detailedEmp.cvAcademic || [],
          specialProjects: detailedEmp.specialProjects || [],
          certifications: detailedEmp.cvCertifications || [],
        };
        setProfile(loadedProfile);
          setDetails(pickEmployeeDetails(detailedEmp));
        setEmail(detailedEmp.email);
        setDepartment(detailedEmp.department);
        setProfileImagePreview(detailedEmp.avatar);
        setProfileImageFile(null);
        setInitialSnapshot(
          JSON.stringify({ profile: loadedProfile, email: detailedEmp.email, department: detailedEmp.department, details: pickEmployeeDetails(detailedEmp) })
        );
      }
    } catch (err) {
      console.error('Failed to revert profile changes:', err);
    } finally {
      setLoadingProfile(false);
    }
  };

  return (
    <PageWrapper className="p-8">
      {/* Page Header */}
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
          Update Profile
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          {selectedId
            ? 'Update their information, replace their profile photo, or import a new CV.'
            : 'Search for an employee to update their information, replace their profile photo, or import a new CV.'}
        </p>
      </div>

      {/* Employee picker — search + list, replaces the selected employee's edit form below once clicked */}
      {!selectedId && (
        <>
          <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm mb-4 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-8 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, role, or department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/80 rounded-xl py-3 pl-10 pr-4 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition-all text-slate-700 placeholder:text-slate-400"
            />
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mb-8">
            {filteredEmployees.length > 0 ? (
              <div className="divide-y divide-slate-100">
                {filteredEmployees.map((emp) => (
                  <button
                    key={emp.rowId}
                    type="button"
                    onClick={() => setSelectedId(emp.rowId)}
                    className="w-full flex items-center gap-4 p-4 hover:bg-slate-50 transition-colors text-left cursor-pointer"
                  >
                    {emp.avatar && !emp.avatar.includes('unsplash.com') ? (
                      <img
                        src={emp.avatar}
                        alt={emp.name}
                        className="w-11 h-11 rounded-full border border-slate-200 object-cover shrink-0"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center shrink-0">
                        <UserCircle className="w-6 h-6 text-slate-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black text-slate-800 truncate">{emp.name}</p>
                      <p className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {emp.role} · {emp.email}
                      </p>
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full border bg-slate-50 border-slate-200 text-slate-500 shrink-0 hidden sm:inline-block">
                      {emp.department}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <p className="text-sm font-medium text-slate-400">
                  No employee profiles match your search.
                </p>
              </div>
            )}
          </div>
        </>
      )}

      {loadingProfile && (
        <div className="flex justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      )}

      {!loadingProfile && activeProfile && (
        <>
          {/* Sticky action bar — Save Changes lives here instead of only at the bottom of a long
              form, plus a way back to the search list without losing your place. */}
          <div className="sticky top-16 z-20 -mx-8 px-8 py-3.5 mb-6 bg-white/95 backdrop-blur border-b border-slate-200/80 shadow-sm flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={handleBackToList}
              className="flex items-center gap-1.5 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider transition-colors cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to List</span>
            </button>

            <div className="flex-1 min-w-0 text-center hidden sm:block">
              <p className="text-xs font-black text-slate-800 truncate">Editing {activeProfile.name}</p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {saveError && (
                <p className="text-[11px] font-semibold text-rose-600 max-w-[240px] truncate" title={saveError}>
                  {saveError}
                </p>
              )}
              {successMessage && (
                <p className="text-[11px] font-semibold text-emerald-600 max-w-[240px] truncate flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  {successMessage}
                </p>
              )}
              <button
                type="button"
                onClick={handleCancel}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-sans text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl border border-slate-200/80 active:scale-95 transition-all flex items-center gap-2 cursor-pointer"
              >
                <X className="w-4 h-4" />
                <span>Cancel</span>
              </button>
              <button
                type="submit"
                form="update-profile-form"
                disabled={isSaving || !isDirty}
                title={!isDirty && !isSaving ? 'No changes to save yet' : undefined}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-5 py-2.5 rounded-xl shadow-md shadow-indigo-600/10 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-12 gap-8">
          {/* Left Column - Image Upload & CV Upload */}
          <div className="col-span-12 lg:col-span-5 flex flex-col gap-6">
            {/* Photo upload */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <UserCircle2 className="w-4 h-4 text-indigo-500" />
                Profile Photo
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
                  <p className="text-[11px] text-indigo-600 font-semibold">
                    Current photo displayed (click × to change)
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
                    {isImageDragActive ? 'Drop photo here' : 'Drag & drop or click to replace photo'}
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

            {/* Optional New CV Upload */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm">
              <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-2">
                <CloudUpload className="w-4 h-4 text-indigo-500" />
                Upload New CV (Optional)
              </h4>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
                Uploading a new CV will parse its contents via Gemini AI and overwrite the form fields below. You can review and tweak the changes before saving.
              </p>

              <div
                onDragEnter={handleCvDrag}
                onDragOver={handleCvDrag}
                onDragLeave={() => setIsCvDragActive(false)}
                onDrop={handleCvDrop}
                onClick={() => cvFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-all cursor-pointer min-h-[140px] ${
                  isCvDragActive
                    ? 'border-indigo-500 bg-indigo-50/30'
                    : 'border-slate-300 hover:border-indigo-400 bg-slate-50/20 hover:bg-indigo-50/10'
                }`}
              >
                <input
                  ref={cvFileInputRef}
                  type="file"
                  onChange={handleCvFileChange}
                  accept=".pdf,.docx,.txt"
                  className="hidden"
                />
                <CloudUpload className="w-6 h-6 text-slate-400 mb-2 mx-auto" />
                <span className="text-xs font-bold text-slate-600 block">
                  {cvDroppedFile ? cvDroppedFile.name : 'Drag & drop new CV file'}
                </span>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  PDF, DOCX, TXT up to 10 MB
                </span>
              </div>

              {cvDroppedFile && (
                <div className="mt-4 p-3 border border-slate-150 rounded-xl bg-slate-50 flex items-center gap-2 text-xs font-semibold text-indigo-600">
                  {cvStatus === 'extracting' || cvStatus === 'analyzing' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : cvStatus === 'done' ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  )}
                  <span>
                    {cvStatus === 'extracting' && 'Extracting text...'}
                    {cvStatus === 'analyzing' && 'Gemini AI parsing details...'}
                    {cvStatus === 'done' && 'CV parsed successfully!'}
                    {cvStatus === 'error' && (cvErrorMsg || 'Parsing failed.')}
                  </span>
                </div>
              )}

              {cvStatus === 'done' && parsedCv && (
                <div className="mt-4 p-3 border border-slate-200 rounded-xl bg-indigo-50/20 flex flex-col gap-3">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      id="human-verified-checkbox"
                      type="checkbox"
                      checked={isHumanVerified}
                      onChange={(e) => setIsHumanVerified(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                    />
                    <span className="text-xs font-bold text-slate-700">Human Verified</span>
                  </label>
                  <button
                    type="button"
                    disabled={!isHumanVerified}
                    onClick={handleApplyCv}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider py-2 px-4 rounded-lg shadow-md shadow-indigo-600/10 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none cursor-pointer flex items-center justify-center gap-2"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-sky-200" />
                    <span>Apply to CV</span>
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Form */}
          <div className="col-span-12 lg:col-span-7">
            <form
              id="update-profile-form"
              onSubmit={handleSubmit}
              className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-8"
            >
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h4 className="font-sans text-xs font-black uppercase tracking-widest text-slate-400">
                  Edit Candidate Information
                </h4>
              </div>

              <EmployeeDetailTabs value={{ ...details, name: profile.name, role: profile.currentPosition, department, email }} departments={departments}
                onChange={next => { setDetails(pickEmployeeDetails(next)); setProfile(p => ({ ...p, name: next.name, currentPosition: next.role })); setDepartment(next.department); setEmail(next.email); }}>
              {/* Objective */}
              <div>
                <FieldLabel>Objective / Professional Summary</FieldLabel>
                <textarea
                  rows={3}
                  placeholder="A brief statement of career goals and what they bring to the role..."
                  value={profile.summary}
                  onChange={(e) => updateField('summary', e.target.value)}
                  className={TEXTAREA_CLS}
                />
              </div>

              {/* Experience */}
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

              {/* Academic */}
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

              {/* Special Projects */}
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

              {/* Certifications */}
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

              </EmployeeDetailTabs>
            </form>
          </div>
          </div>
        </>
      )}
    </PageWrapper>
  );
}
