'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { PAGE_SIZE_OPTIONS } from '@/lib/pagination';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  disabled?: boolean;
}

function pageItems(page: number, totalPages: number): Array<number | string> {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])]
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);
  const items: Array<number | string> = [];
  pages.forEach((value, index) => {
    if (index > 0 && value - pages[index - 1] > 1) items.push(`ellipsis-${value}`);
    items.push(value);
  });
  return items;
}

export function Pagination({ page, pageSize, total, onPageChange, onPageSizeChange, disabled }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(page, totalPages);
  const first = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const last = Math.min(currentPage * pageSize, total);

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/40">
      <div className="flex items-center gap-3 text-[11px] font-semibold text-slate-500">
        <span>{first}-{last} of {total}</span>
        <label className="flex items-center gap-2">
          <span>Rows per page</span>
          <select
            value={pageSize}
            disabled={disabled}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
            className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50"
          >
            {PAGE_SIZE_OPTIONS.map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button type="button" disabled={disabled || currentPage <= 1} onClick={() => onPageChange(currentPage - 1)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          <ChevronLeft className="w-3.5 h-3.5" /> Previous
        </button>
        {pageItems(currentPage, totalPages).map((item) => typeof item === 'number' ? (
          <button key={item} type="button" disabled={disabled} onClick={() => onPageChange(item)} className={`min-w-8 h-8 rounded-lg text-[11px] font-black ${item === currentPage ? 'bg-indigo-600 text-white' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'} disabled:opacity-50`}>{item}</button>
        ) : <span key={item} className="px-1 text-slate-400">…</span>)}
        <button type="button" disabled={disabled || currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
          Next <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
