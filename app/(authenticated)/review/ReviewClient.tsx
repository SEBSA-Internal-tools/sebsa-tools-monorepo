'use client';

import React, { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { PageWrapper } from '../../components/PageWrapper';
import CvPreviewTemplate from '../generate/CvPreviewTemplate';
import { buildTailoredCvFromEmployee, buildTailoredCvFromInput } from '@/lib/templates/buildTailoredCvFromEmployee';
import { getEmployeeDetailsAction } from '../update-profile/actions';
import type { TailoredCv } from '../generate/types';
import {
  approveNewProfileAction,
  rejectNewProfileAction,
  approveClaimAction,
  rejectClaimAction,
  approveChangeAction,
  rejectChangeAction,
  listPendingItemsPageAction,
  type PendingItem,
} from './actions';
import { Pagination } from '@/app/components/Pagination';
import type { PaginatedResult } from '@/lib/pagination';
import { ClipboardCheck, UserPlus, LinkIcon, PenLine, Check, X, Loader2, Eye } from 'lucide-react';

interface ReviewClientProps {
  initialPage: PaginatedResult<PendingItem>;
}

const TYPE_META: Record<PendingItem['type'], { label: string; icon: React.ElementType; color: string }> = {
  new_profile: { label: 'New Profile', icon: UserPlus, color: 'text-sky-600 bg-sky-50 border-sky-100' },
  claim: { label: 'Account Claim', icon: LinkIcon, color: 'text-indigo-600 bg-indigo-50 border-indigo-100' },
  change: { label: 'Profile Edit', icon: PenLine, color: 'text-amber-600 bg-amber-50 border-amber-100' },
};

export default function ReviewClient({ initialPage }: ReviewClientProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialPage.items);
  const [total, setTotal] = useState(initialPage.total);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [listLoading, setListLoading] = useState(false);
  const [processingKey, setProcessingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  // 'new_profile' and 'change' both preview in the real CV template here — a claim has no new CV
  // content of its own (it's just linking an account to an already-viewable published profile),
  // so that one still navigates to the profile page instead.
  const [previewItem, setPreviewItem] = useState<PendingItem | null>(null);
  const [previewCv, setPreviewCv] = useState<TailoredCv | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    setListLoading(true);
    listPendingItemsPageAction(page, pageSize).then((result) => {
      setItems(result.items);
      setTotal(result.total);
    }).catch((err) => setError(err instanceof Error ? err.message : 'Failed to load approvals.'))
      .finally(() => setListLoading(false));
  }, [page, pageSize]);

  const keyFor = (item: PendingItem) => `${item.type}:${item.profileId}`;

  const handleView = async (item: PendingItem) => {
    if (item.type === 'claim') {
      router.push(`/repository/${item.profileId}`);
      return;
    }

    setPreviewItem(item);
    setPreviewCv(null);
    setPreviewError(null);
    setPreviewLoading(true);

    try {
      if (item.type === 'change' && item.proposedChange) {
        // The proposal only carries a new avatarUrl if the employee actually replaced their
        // photo (see ProfileChangeSubmission's doc comment) — fetch the current profile so the
        // preview falls back to their existing photo instead of showing no image at all.
        const current = await getEmployeeDetailsAction(item.profileId);
        setPreviewCv(buildTailoredCvFromInput(item.proposedChange, current?.avatar));
      } else {
        // new_profile — nothing proposed yet to diff against, just render the submitted profile.
        const employee = await getEmployeeDetailsAction(item.profileId);
        if (employee) {
          setPreviewCv(buildTailoredCvFromEmployee(employee));
        } else {
          setPreviewError('Could not load this profile.');
        }
      }
    } catch (err) {
      console.error('Failed to load profile for preview:', err);
      setPreviewError(err instanceof Error ? err.message : 'Could not load this profile.');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleAction = (item: PendingItem, action: 'approve' | 'reject') => {
    const key = keyFor(item);
    setProcessingKey(key);
    setError(null);

    startTransition(async () => {
      try {
        if (item.type === 'new_profile') {
          await (action === 'approve' ? approveNewProfileAction : rejectNewProfileAction)(item.profileId);
        } else if (item.type === 'claim') {
          await (action === 'approve' ? approveClaimAction : rejectClaimAction)(item.profileId);
        } else {
          await (action === 'approve' ? approveChangeAction : rejectChangeAction)(item.profileId);
        }
        const result = await listPendingItemsPageAction(page, pageSize);
        setItems(result.items);
        setTotal(result.total);
        router.refresh();
      } catch (err) {
        console.error(`Failed to ${action} pending item:`, err);
        setError(err instanceof Error ? err.message : `Failed to ${action} this request.`);
      } finally {
        setProcessingKey(null);
      }
    });
  };

  return (
    <PageWrapper className="p-8">
      <div className="mb-8">
        <h2 className="text-3xl font-black tracking-tight text-slate-900 font-sans leading-none">
          Pending Approvals
        </h2>
        <p className="text-sm font-medium text-slate-500 mt-2">
          New self-service profiles, account claim requests, and proposed profile edits awaiting review.
        </p>
      </div>

      {error && (
        <p className="mb-6 text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm p-12 flex flex-col items-center text-center">
          <ClipboardCheck className="w-10 h-10 text-slate-300 mb-4" />
          <h5 className="text-sm font-bold text-slate-700">All caught up</h5>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
            Nothing is waiting for review right now.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm divide-y divide-slate-100">
          {items.map((item) => {
            const meta = TYPE_META[item.type];
            const Icon = meta.icon;
            const key = keyFor(item);
            const busy = isPending && processingKey === key;

            return (
              <div key={key} className="p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4 min-w-0">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${meta.color}`}>
                    <Icon className="w-4.5 h-4.5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-black text-slate-800 truncate">{item.name}</p>
                      <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded border ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    {item.type === 'change' && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {item.changedFields === undefined ? (
                          <span className="text-[11px] text-slate-400">Could not load what changed.</span>
                        ) : item.changedFields.length === 0 ? (
                          <span className="text-[11px] text-slate-400">No detectable field changes.</span>
                        ) : (
                          item.changedFields.map((diff) => (
                            <span
                              key={diff.field}
                              title={diff.before && diff.after ? `${diff.before} → ${diff.after}` : undefined}
                              className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full"
                            >
                              {diff.field}
                              {diff.before && diff.after && (
                                <span className="font-medium text-amber-600"> · {diff.before} → {diff.after}</span>
                              )}
                            </span>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => handleView(item)}
                    title="View in template format"
                    className="flex items-center gap-1.5 p-2 border border-slate-200 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 hover:bg-indigo-50 rounded-xl transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleAction(item, 'reject')}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3.5 py-2 border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 rounded-xl text-[11px] font-bold transition-all disabled:opacity-40"
                  >
                    <X className="w-3.5 h-3.5" />
                    <span>Reject</span>
                  </button>
                  <button
                    onClick={() => handleAction(item, 'approve')}
                    disabled={busy}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black transition-all disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                    <span>Approve</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pending-item preview modal — renders a new profile or a proposed edit in the real CV
          template so a reviewer can see exactly what approving it would publish. */}
      <Pagination page={page} pageSize={pageSize} total={total} disabled={listLoading || isPending}
        onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />

      {previewItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 md:p-6">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
              <div>
                <h4 className="text-sm font-black text-slate-800">
                  {previewItem.type === 'change' ? 'Proposed Change' : 'New Profile'} — {previewItem.name}
                </h4>
                <p className="text-[11px] text-slate-450 font-medium mt-0.5">
                  {previewItem.type === 'change'
                    ? 'Rendered from the proposed edit, not the currently-live profile.'
                    : 'Rendered from the submitted profile, pending your approval.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="p-1.5 hover:bg-slate-200/65 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto bg-slate-100 flex-1 flex flex-col items-center gap-4">
              {previewItem.type === 'change' && previewItem.changedFields && previewItem.changedFields.length > 0 && (
                <div className="w-full max-w-[800px] bg-amber-50 border border-amber-200 rounded-xl p-4 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-wider text-amber-800">Changed in this proposal</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {previewItem.changedFields.map((diff) => (
                      <div key={diff.field} className="text-xs text-amber-900 bg-white/80 border border-amber-200 rounded-lg px-3 py-2">
                        <span className="font-black">{diff.field}</span>
                        {diff.before && diff.after && <span className="font-medium">: {diff.before} → {diff.after}</span>}
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-amber-700 mt-2">Applicable CV sections are highlighted below. Profile-only fields such as Department are listed here.</p>
                </div>
              )}
              {previewLoading && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-indigo-600" />
                  <p className="text-xs font-semibold text-slate-400">Loading preview...</p>
                </div>
              )}
              {previewError && !previewLoading && (
                <p className="text-xs font-semibold text-rose-600 bg-rose-50 border border-rose-200/60 rounded-lg px-3 py-2 my-8">
                  {previewError}
                </p>
              )}
              {previewCv && !previewLoading && (
                <CvPreviewTemplate
                  cv={previewCv}
                  id="cv-preview-review"
                  highlightFields={previewItem.changedFields?.map((diff) => diff.field) ?? []}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </PageWrapper>
  );
}
