import { useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  MessageSquareWarning,
  User,
  Image as ImageIcon,
} from 'lucide-react';
import type { ReviewHistoryEntry } from '@sdp/contracts';
import { cn } from '@/components/ui';
import { RankBadge, StatusBadge, Tag } from '@/portals/code-review/components/badges.tsx';
import { Dialog } from '@/components/ui/Dialog.tsx';
import { formatDateTime, interpolate } from '@/lib/formatters.ts';
import reviews from '@/content/reviews.json';

/**
 * Completed review cycles rendered as an interactive vertical timeline,
 * newest first (screen 14; spec section 1.5 p.11 specifies descending order).
 *
 * The latest cycle is expanded by default for immediate context, while older
 * cycles are collapsed to conserve vertical height.
 */
export function ReviewCycleHistory({ entries }: { entries: readonly ReviewHistoryEntry[] }) {
  const ordered = [...entries].sort((a, b) => b.reviewCycle - a.reviewCycle);
  const [expandedCycles, setExpandedCycles] = useState<Record<string, boolean>>({
    // Expand the latest cycle by default
    [ordered[0]?.id ?? '']: true,
  });
  const [selectedImage, setSelectedImage] = useState<{
    src: string;
    alt: string;
  } | null>(null);

  if (ordered.length === 0) return null;

  return (
    <>
      <div className="relative space-y-4 pl-6 before:absolute before:top-3 before:bottom-3 before:left-2.5 before:w-0.5 before:bg-line sm:pl-7">
        {ordered.map((entry, index) => {
          const isLatest = index === 0;
          const isExpanded = expandedCycles[entry.id] ?? isLatest;
          const isApproved = entry.decision === 'Approved';

          return (
            <div key={entry.id} className="group relative">
              {/* Timeline Node Icon */}
              <div
                className={cn(
                  'absolute top-3.5 -left-6 grid size-5 -translate-x-1/2 place-items-center rounded-full bg-surface shadow-2xs ring-4 ring-surface sm:-left-7',
                  isApproved ? 'text-emerald-600' : 'text-amber-500',
                )}
                aria-hidden="true"
              >
                {isApproved ? (
                  <CheckCircle2 className="size-4 fill-emerald-100 text-emerald-600" />
                ) : (
                  <MessageSquareWarning className="size-4 fill-amber-100 text-amber-600" />
                )}
              </div>

              {/* Cycle Card */}
              <div
                className={cn(
                  'overflow-hidden rounded-xl border transition-all duration-200',
                  isApproved
                    ? 'border-emerald-200/70 bg-emerald-50/15'
                    : 'border-amber-200/70 bg-amber-50/15',
                )}
              >
                <button
                  type="button"
                  onClick={() => {
                    setExpandedCycles((prev) => ({
                      ...prev,
                      [entry.id]: !isExpanded,
                    }));
                  }}
                  aria-expanded={isExpanded}
                  className="flex w-full items-center justify-between gap-3 p-3.5 text-left transition-colors hover:bg-surface/60 sm:p-4"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Tag className="bg-violet-100 font-bold text-violet-700">
                      {interpolate(reviews.form.cycleLabel, {
                        cycle: entry.reviewCycle,
                      })}
                    </Tag>

                    {entry.decision === null ? null : (
                      <StatusBadge
                        status={entry.decision === 'Approved' ? 'Approved' : 'ChangesRequested'}
                      />
                    )}

                    {entry.rank === null ? null : <RankBadge rank={entry.rank} />}

                    <span className="text-ink-600 flex items-center gap-1 text-xs font-medium">
                      <User className="size-3 text-ink-400" aria-hidden="true" />
                      {entry.reviewerName}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-2.5">
                    {entry.decidedAt === null ? null : (
                      <span className="hidden text-xs text-ink-400 sm:inline">
                        {formatDateTime(entry.decidedAt)}
                      </span>
                    )}
                    <ChevronDown
                      className={cn(
                        'size-4 text-ink-400 transition-transform duration-200',
                        isExpanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </div>
                </button>

                {isExpanded ? (
                  <div className="space-y-3 px-3.5 pt-1 pb-3.5 sm:px-4 sm:pb-4">
                    {entry.feedbackSummary.trim() === '' ? null : (
                      <div className="rounded-lg border border-line bg-surface p-3 shadow-2xs">
                        <p className="mb-1 text-xs font-bold tracking-wider text-ink-500 uppercase">
                          Reviewer Feedback
                        </p>
                        <p className="text-ink-800 text-sm leading-relaxed whitespace-pre-wrap">
                          {entry.feedbackSummary}
                        </p>
                      </div>
                    )}

                    {entry.screenshots.length === 0 ? null : (
                      <div>
                        <p className="text-ink-600 mb-2 flex items-center gap-1.5 text-xs font-semibold">
                          <ImageIcon className="size-3.5 text-ink-400" aria-hidden="true" />
                          Attached Findings & Screenshots ({entry.screenshots.length})
                        </p>
                        <ul className="flex flex-wrap gap-2.5">
                          {entry.screenshots.map((shot) => (
                            <li key={shot.id}>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedImage({
                                    src: shot.storageRef,
                                    alt: shot.comment === '' ? shot.fileName : shot.comment,
                                  })
                                }
                                className="group relative block overflow-hidden rounded-lg border border-line transition-colors hover:border-violet-400 focus-visible:outline-2 focus-visible:outline-violet-600"
                              >
                                <img
                                  src={shot.storageRef}
                                  alt={shot.comment === '' ? shot.fileName : shot.comment}
                                  className="size-16 object-cover transition-transform group-hover:scale-105"
                                />
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {selectedImage ? (
        <Dialog
          open={true}
          onOpenChange={(open) => {
            if (!open) setSelectedImage(null);
          }}
          title={selectedImage.alt || 'Screenshot Preview'}
          size="lg"
        >
          <div className="flex justify-center p-2">
            <img
              src={selectedImage.src}
              alt={selectedImage.alt}
              className="max-h-[70vh] rounded-lg object-contain shadow-md"
            />
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
