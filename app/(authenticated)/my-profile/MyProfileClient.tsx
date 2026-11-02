'use client';

import EmployeeDetailTabs from '@/app/components/EmployeeDetailTabs';
import { pickEmployeeDetails, type EmployeeDetails } from '@/lib/employeeDetails';
import { getProfilePictureValidationError } from '@/lib/profilePicture';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import type { Employee } from '@/types/domain';
import ProfileFieldsEditor, { type ProfileFieldsValue } from '../../components/ProfileFieldsEditor';
import { proposeProfileChangeAction } from './actions';
import { uploadProfilePictureAction } from '../upload/actions';
import { ArrowLeft, Clock, Loader2, ImageIcon } from 'lucide-react';

interface MyProfileClientProps {
  employee: Employee;
  departments: { id: string; name: string }[];
}

export default function MyProfileClient({ employee, departments }: MyProfileClientProps) {
  const router = useRouter();

  const [details, setDetails] = useState<EmployeeDetails>(() => pickEmployeeDetails(employee));
  const [value, setValue] = useState<ProfileFieldsValue>({
    name: employee.name,
    role: employee.role,
    department: employee.department,
    summary: employee.summary ?? '',
    skills: employee.skills,
    experience: employee.cvExperience ?? [],
    academic: employee.cvAcademic ?? [],
    specialProjects: employee.specialProjects ?? [],
    certifications: employee.cvCertifications ?? [],
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const [avatarPreview, setAvatarPreview] = useState<string | null>(employee.avatar || null);
  const [avatarUrl, setAvatarUrl] = useState<string | undefined>(undefined);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const avatarInputRef = React.useRef<HTMLInputElement>(null);

  const handleAvatarChange = async (file: File) => {
    const validationError = getProfilePictureValidationError(file);
    if (validationError) {
      setAvatarError(validationError);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
      return;
    }

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      await proposeProfileChangeAction({
        ...details,
        name: value.name,
        role: value.role,
        department: value.department,
        summary: value.summary,
        skills: value.skills,
        cvExperience: value.experience,
        cvAcademic: value.academic,
        specialProjects: value.specialProjects,
        cvCertifications: value.certifications,
        avatarUrl,
      });
      setSubmitted(true);
    } catch (err) {
      console.error('Failed to propose profile change:', err);
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit your changes.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (employee.hasPendingChange || submitted) {
    return (
      <PageWrapper className="p-8">
        <button
          onClick={() => router.push(`/repository/${employee.rowId}`)}
          className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to My Profile</span>
        </button>
        <div className="max-w-md mx-auto bg-white p-8 rounded-2xl border border-slate-200/80 shadow-sm text-center">
          <div className="w-14 h-14 bg-amber-50 rounded-full flex items-center justify-center text-amber-600 mb-5 mx-auto">
            <Clock className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black tracking-tight text-slate-900 font-sans leading-tight mb-2">
            Update pending review
          </h1>
          <p className="text-sm text-slate-500">
            Your proposed changes are waiting for a Super Admin or HR to approve. Your
            current profile stays as-is until then.
          </p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper className="p-8">
      <button
        onClick={() => router.push(`/repository/${employee.rowId}`)}
        className="flex items-center gap-2 text-xs font-black text-slate-500 hover:text-slate-900 uppercase tracking-wider mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>Back to My Profile</span>
      </button>

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h2 className="text-2xl font-black tracking-tight text-slate-900 font-sans leading-none">
            Update My Profile
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Your changes are reviewed by a Super Admin or HR before they appear on your profile.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Profile picture — editable, not a mandatory field */}
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
              <p className="text-xs font-bold text-slate-700">Profile Picture</p>
              <p className="text-[11px] text-slate-400 mt-0.5">{avatarUploading ? 'Uploading...' : 'Optional'}</p>
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
              {avatarUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Change Photo'}
            </button>
          </div>

          <EmployeeDetailTabs value={{ ...details, name: value.name, role: value.role, department: value.department, email: employee.email }} departments={departments} emailEditable={false}
            onChange={next => { setDetails(pickEmployeeDetails(next)); setValue({ ...value, name: next.name, role: next.role, department: next.department }); }}>
            <ProfileFieldsEditor value={value} onChange={setValue} departments={departments} profileOnly />
          </EmployeeDetailTabs>

          {submitError && (
            <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
              {submitError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-sans text-xs font-black uppercase tracking-wider px-6 py-3.5 rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <span>{isSubmitting ? 'Submitting...' : 'Submit for Review'}</span>
          </button>
        </form>
      </div>
    </PageWrapper>
  );
}
