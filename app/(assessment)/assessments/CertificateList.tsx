import React from 'react';
import { Award, Download } from 'lucide-react';
import type { AssessmentCertificate } from '@/types/assessment';

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/**
 * Certificate rows shared by the overview and the certificates page. Downloads are plain links to
 * the route handler: the session cookie authorises them, so no client-side fetch is needed.
 */
export default function CertificateList({
  certificates,
  emptyText,
}: {
  certificates: AssessmentCertificate[];
  emptyText: string;
}) {
  if (certificates.length === 0) {
    return (
      <div className="flex items-start gap-4">
        <div className="p-3 bg-slate-100 rounded-xl text-slate-400"><Award className="w-5 h-5" /></div>
        <div>
          <p className="text-sm font-black text-slate-800">No certificates yet</p>
          <p className="text-xs font-medium text-slate-500 mt-1.5 leading-relaxed">{emptyText}</p>
        </div>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {certificates.map((cert) => (
        <li key={cert.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 shrink-0"><Award className="w-4 h-4" /></div>
            <div className="min-w-0">
              <p className="text-xs font-black text-slate-800 truncate">{cert.cycleLabel ?? 'SEBSA Assessment Certificate'}</p>
              <p className="text-[10px] font-semibold text-slate-400 mt-1">
                Issued <time dateTime={cert.issuedAt} suppressHydrationWarning>{formatDate(cert.issuedAt)}</time>
                {cert.score !== null && ` · Score ${cert.score}/10`}
              </p>
            </div>
          </div>
          <a
            href={`/api/assessments/certificates/${encodeURIComponent(cert.certificateNumber)}`}
            download
            aria-label={`Download PDF certificate for ${cert.cycleLabel ?? 'SEBSA assessment'}`}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black transition-all shrink-0"
          >
            <Download className="w-3.5 h-3.5" />PDF
          </a>
        </li>
      ))}
    </ul>
  );
}
