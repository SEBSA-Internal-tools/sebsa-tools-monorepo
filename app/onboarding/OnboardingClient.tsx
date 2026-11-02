'use client';

import { pickEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';
import EmployeeDetailTabs from '@/app/components/EmployeeDetailTabs';


import React, { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../components/PageWrapper';
import { createClient } from '@/lib/supabase/client';
import { extractText } from '@/lib/parsing/extractClientText';
import { getProfilePictureValidationError } from '@/lib/profilePicture';
import type { CvProfile } from '@/lib/cvTypes';
import ProfileFieldsEditor, { emptyProfileFieldsValue, type ProfileFieldsValue } from '../components/ProfileFieldsEditor';
import { createOwnProfileAction, claimProfileAction, type ClaimableProfile } from './actions';
import { uploadProfilePictureAction } from '../(authenticated)/upload/actions';
import {
  CloudUpload,
  FileText,
  Loader2,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  AlertCircle,
  UserCheck,
  UserX,
  Clock,
  FilePlus2,
  PenLine,
  ImageIcon,
  ArrowLeft,
} from 'lucide-react';

type Mode = 'pending-claim' | 'claim' | 'choose' | 'upload' | 'manual';
type ExtractStatus = 'idle' | 'extracting' | 'analyzing' | 'done' | 'error';

interface OnboardingClientProps {
  userEmail: string;
  departments: { id: string; name: string }[];
  claimableProfile: ClaimableProfile | null;
  pendingClaim: boolean;
}

export default function OnboardingClient({ userEmail, departments, claimableProfile, pendingClaim }: OnboardingClientProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(pendingClaim ? 'pending-claim' : claimableProfile ? 'claim' : 'choose');
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  // There's nowhere else in the app an Employee without a profile can land — every other page
  // either requires one or redirects back here — so "not now" means signing out. Logging back in
  // later re-enters this same flow at whatever state was already in progress (server-derived on
  // every load), so nothing is lost.
  const [isSigningOut, setIsSigningOut] = useState(false);
  const handleSkipForNow = async () => {
    setIsSigningOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const SkipForNowLink = (
    <button
      type="button"
      onClick={handleSkipForNow}
      disabled={isSigningOut}
      className="text-[11px] font-bold text-slate-400 hover:text-slate-600 underline underline-offset-2 disabled:opacity-40 transition-colors"
    >
      {isSigningOut ? 'Signing out...' : "Not now — I'll finish this later"}
    </button>
  );

  const handleClaim = async () => {
    if (!claimableProfile) return;
    setIsClaiming(true);
    setClaimError(null);
    try {
      await claimProfileAction(claimableProfile.id);
      setMode('pending-claim');
    } catch (err) {
      console.error('Profile claim request failed:', err);
      setClaimError(err instanceof Error ? err.message : 'Failed to submit your claim request.');
    } finally {
      setIsClaiming(false);
    }
  };

  // ── CV upload + parse (only used in 'upload' mode) ────────────────────────
  const [status, setStatus] = useState<ExtractStatus>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [droppedFile, setDroppedFile] = useState<{ name: string; size: string } | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Profile picture (both 'upload' and 'manual' modes) ────────────────────
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  // ── The profile being built — shared shape for both upload-parsed and manual entry ──
  const [details, setDetails] = useState<EmployeeDetails>({});
  const [profileValue, setProfileValue] = useState<ProfileFieldsValue>(
    emptyProfileFieldsValue({ department: departments[0]?.name ?? '' })
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleAvatarChange = async (file: File) => {
    const validationError = getProfilePictureValidationError(file);
    if (validationError) {
      setAvatarError(validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
    setAvatarError(null);
    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const url = await uploadProfilePictureAction(formData);
      setAvatarUrl(url);
    } catch (err) {
      console.error('Profile picture upload failed:', err);
      setAvatarError(err instanceof Error ? err.message : 'Failed to upload photo.');
    } finally {
      setAvatarUploading(false);
    }
  };

  const processFile = async (file: File) => {
    const sizeStr = (file.size / (1024 * 1024)).toFixed(1) + ' MB';
    setDroppedFile({ name: file.name, size: sizeStr });
    setStatus('extracting');
    setErrorMsg(null);

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
      setProfileValue((prev) => ({
        ...prev,
        name: parsed.name || prev.name,
        role: parsed.currentPosition || prev.role,
        summary: parsed.summary || prev.summary,
        experience: parsed.experience,
        academic: parsed.academic,
        specialProjects: parsed.specialProjects,
        certifications: parsed.certifications,
      }));
      setStatus('done');
    } catch (err) {
      console.error('CV parsing failed:', err);
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'CV analysis failed.');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) processFile(e.target.files[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await createOwnProfileAction({
        ...details,
        name: profileValue.name,
        role: profileValue.role,
        department: profileValue.department,
        skills: profileValue.skills,
        currentPosition: profileValue.role,
        summary: profileValue.summary,
        cvExperience: profileValue.experience,
        cvAcademic: profileValue.academic,
        specialProjects: profileValue.specialProjects,
        cvCertifications: profileValue.certifications,
        avatarUrl: avatarUrl ?? undefined,
      });
      // createOwnProfileAction redirects on success
    } catch (err) {
      console.error('Self-service profile creation failed:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit your profile.');
      setIsSubmitting(false);
    }
  };

  // ── Reusable: profile picture picker ───────────────────────────────────────
  const AvatarPicker = (
    <div className="bg-white p-4 rounded-2xl border border-slate-200/80 shadow-sm flex items-center gap-4">
      <div className="w-16 h-16 rounded-full border-2 border-slate-200 bg-slate-50 overflow-hidden shrink-0 flex items-center justify-center">
        {avatarPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={avatarPreview} alt="Profile" className="w-full h-full object-cover" />
        ) : (
          <ImageIcon className="w-6 h-6 text-slate-300" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          Profile Picture
          <span className="text-rose-500 font-bold normal-case tracking-normal text-[10px] bg-rose-50 border border-rose-100/60 px-2 py-0.5 rounded-full">Required</span>
        </p>
        <p className="text-[11px] text-slate-400 mt-0.5">
          {avatarUploading ? 'Uploading...' : avatarUrl ? 'Uploaded' : 'Not extracted from your CV — add one now.'}
        </p>
        {avatarError && <p className="text-[11px] text-rose-600 mt-1">{avatarError}</p>}
      </div>
      <input
        type="file"
        ref={avatarInputRef}
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleAvatarChange(e.target.files[0])}
      />
      <button
        type="button"
        onClick={() => avatarInputRef.current?.click()}
        disabled={avatarUploading}
        className="px-3.5 py-2 border border-slate-200 hover:bg-slate-50 rounded-lg text-[11px] font-bold text-slate-600 transition-colors disabled:opacity-40 shrink-0"
      >
        {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Choose Photo'}
      </button>
    </div>
  );

  // ── Pending claim (already requested) ──────────────────────────────────────
  if (mode === 'pending-claim') {
    return (
      <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
        <div className="w-full max-w-md">
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-5 mx-auto">
              <Clock className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 font-sans leading-tight mb-2">
              Waiting for approval
            </h1>
            <p className="text-sm text-slate-500 mb-2">
              We've asked a Super Admin or HR to confirm this profile is yours. You'll
              get access as soon as it's approved.
            </p>
          </div>
          <div className="text-center mt-5">{SkipForNowLink}</div>
        </div>
      </PageWrapper>
    );
  }

  // ── Claim confirmation ──────────────────────────────────────────────────────
  if (mode === 'claim' && claimableProfile) {
    return (
      <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
        <div className="w-full max-w-md">
          <div className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-5 mx-auto">
              <UserCheck className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 font-sans leading-tight mb-2">
              We found a profile for you
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              An existing record matches your work email — is this you?
            </p>

            <div className="text-left p-4 border border-slate-200 rounded-xl bg-slate-50/50 mb-6 space-y-1">
              <p className="text-sm font-black text-slate-800">{claimableProfile.name}</p>
              <p className="text-xs text-slate-500">{claimableProfile.role || 'Role not specified'}</p>
              <p className="text-xs text-slate-500">{claimableProfile.department}</p>
            </div>

            {claimError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2 mb-4">
                {claimError}
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setMode('choose')}
                disabled={isClaiming}
                className="flex items-center justify-center gap-1.5 py-3 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs hover:bg-slate-50 transition-colors disabled:opacity-40"
              >
                <UserX className="w-4 h-4" />
                <span>Not me</span>
              </button>
              <button
                type="button"
                onClick={handleClaim}
                disabled={isClaiming}
                className="flex items-center justify-center gap-1.5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-xs transition-colors disabled:opacity-40"
              >
                {isClaiming ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4" />}
                <span>{isClaiming ? 'Requesting...' : "Yes, that's me"}</span>
              </button>
            </div>
          </div>
          <div className="text-center mt-5">{SkipForNowLink}</div>
        </div>
      </PageWrapper>
    );
  }

  // ── Choose: upload a CV, or create manually ─────────────────────────────────
  if (mode === 'choose') {
    return (
      <PageWrapper className="min-h-screen w-full flex items-center justify-center bg-[#fbf9fb] p-8">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <h1 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
              Welcome — let's set up your profile
            </h1>
            <p className="text-sm font-medium text-slate-500 mt-2">
              An Admin will review your profile before it appears in the company repository.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <button
              type="button"
              onClick={() => setMode('upload')}
              className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 mx-auto">
                <CloudUpload className="w-7 h-7" />
              </div>
              <h5 className="text-sm font-black text-slate-800 mb-1.5">Upload my CV</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                We'll extract your details automatically — review and correct before submitting.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setMode('manual')}
              className="bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center hover:border-indigo-300 hover:shadow-md transition-all"
            >
              <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4 mx-auto">
                <PenLine className="w-7 h-7" />
              </div>
              <h5 className="text-sm font-black text-slate-800 mb-1.5">Create manually</h5>
              <p className="text-xs text-slate-400 leading-relaxed">
                Don't have a CV handy? Fill in your details yourself instead.
              </p>
            </button>
          </div>
          <div className="text-center mt-8">{SkipForNowLink}</div>
        </div>
      </PageWrapper>
    );
  }

  // ── Manual entry: skip straight to the shared review form ───────────────────
  if (mode === 'manual') {
    return (
      <PageWrapper className="p-8">
        <button
          onClick={() => setMode('choose')}
          className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <div className="max-w-xl mx-auto">
          <div className="mb-6">
            <h2 className="text-2xl font-black tracking-tight text-slate-900 font-sans leading-none flex items-center gap-2">
              <FilePlus2 className="w-6 h-6 text-indigo-600" /> Create Your Profile
            </h2>
            <p className="text-sm font-medium text-slate-500 mt-2">
              Fill in your details below. An Admin will review it before it appears in the repository.
            </p>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {AvatarPicker}
            <EmployeeDetailTabs value={{ ...details, name: profileValue.name, role: profileValue.role, department: profileValue.department, email: userEmail }} departments={departments} emailEditable={false}
              onChange={next => { setDetails(pickEmployeeDetails(next)); setProfileValue({ ...profileValue, name: next.name, role: next.role, department: next.department }); }}>
              <ProfileFieldsEditor value={profileValue} onChange={setProfileValue} departments={departments} profileOnly />
            </EmployeeDetailTabs>
            {submitError && (
              <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                {submitError}
              </p>
            )}
            <button
              type="submit"
              disabled={isSubmitting || !profileValue.name || !profileValue.role || !avatarUrl}
              title={!avatarUrl ? 'A profile photo is required' : undefined}
              className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-6 py-3.5 rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
              {!isSubmitting && <ArrowRight className="w-4 h-4" />}
            </button>
          </form>
        </div>
      </PageWrapper>
    );
  }

  // ── Upload CV mode ────────────────────────────────────────────────────────
  return (
    <PageWrapper className="p-8">
      <button
        onClick={() => setMode('choose')}
        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back</span>
      </button>
      <div className="max-w-2xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
            Upload your CV
          </h1>
          <p className="text-sm font-medium text-slate-500 mt-2">
            An Admin will review your profile before it appears in the company repository.
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm flex flex-col gap-6">
          <div
            onDragEnter={handleDrag}
            onDragOver={handleDrag}
            onDragLeave={handleDrag}
            onDrop={handleDrop}
            onClick={status === 'idle' ? () => fileInputRef.current?.click() : undefined}
            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all min-h-[160px] ${
              isDragActive
                ? 'border-indigo-600 bg-indigo-50/20 cursor-pointer'
                : status === 'idle'
                ? 'border-slate-300 hover:border-slate-400 bg-slate-50/20 hover:bg-slate-50/50 cursor-pointer'
                : 'border-slate-200 bg-slate-50/50 cursor-default'
            }`}
          >
            <input type="file" ref={fileInputRef} onChange={handleFileChange} accept=".pdf,.docx,.txt" className="hidden" />
            <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center text-indigo-600 mb-4">
              <CloudUpload className="w-6.5 h-6.5" />
            </div>
            <h5 className="text-sm font-bold text-slate-800 mb-1">Drag & drop your CV here</h5>
            <p className="text-xs text-slate-400 max-w-[220px] leading-relaxed">
              or <span className="text-indigo-600 font-semibold underline">browse local files</span>. Supports PDF, DOCX, TXT.
            </p>
          </div>

          {droppedFile && (
            <div className="p-4 border border-slate-200 rounded-xl bg-slate-50/50 flex items-center gap-3">
              <div className="w-10 h-10 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-indigo-600 shrink-0 shadow-sm">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate leading-none">{droppedFile.name}</p>
                <p className="text-[10px] text-slate-400 mt-1 font-semibold leading-none">{droppedFile.size}</p>
              </div>
              {status === 'extracting' && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Reading file...
                </span>
              )}
              {status === 'analyzing' && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> AI analyzing...
                </span>
              )}
              {status === 'done' && (
                <span className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-600">
                  <CheckCircle2 className="w-4 h-4" /> Parsed
                </span>
              )}
            </div>
          )}

          {status === 'error' && errorMsg && (
            <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
            </p>
          )}

          {status === 'done' && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-2 border-t border-slate-100">
              <div className="flex items-center gap-1.5 text-[11px] font-black text-indigo-600 uppercase tracking-wide">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Review before submitting</span>
              </div>

              {AvatarPicker}


              <EmployeeDetailTabs value={{ ...details, name: profileValue.name, role: profileValue.role, department: profileValue.department, email: userEmail }} departments={departments} emailEditable={false}
              onChange={next => { setDetails(pickEmployeeDetails(next)); setProfileValue({ ...profileValue, name: next.name, role: next.role, department: next.department }); }}>
              <ProfileFieldsEditor value={profileValue} onChange={setProfileValue} departments={departments} profileOnly />
            </EmployeeDetailTabs>

              {submitError && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
                  {submitError}
                </p>
              )}

              <button
                type="submit"
                disabled={isSubmitting || !avatarUrl}
                title={!avatarUrl ? 'A profile photo is required' : undefined}
                className="mt-2 bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-6 py-3.5 rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
                {!isSubmitting && <ArrowRight className="w-4 h-4" />}
              </button>
            </form>
          )}
        </div>
      </div>
    </PageWrapper>
  );
}
