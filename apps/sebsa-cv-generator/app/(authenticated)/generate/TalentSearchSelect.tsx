'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { Employee } from '@/types/domain';
import { getCvDisplayName } from '@/lib/templates/buildTailoredCvFromEmployee';
import { listEmployeesPageAction } from '../repository/actions';
import { Pagination } from '@/app/components/Pagination';
import type { PaginatedResult } from '@/lib/pagination';

interface TalentSearchSelectProps {
  initialPage: PaginatedResult<Employee>;
  selectedId: string;
  onSelect: (id: string, employee: Employee) => void;
}

/** Wraps the first case-insensitive match of `query` inside `text` in a highlighted <mark> —
 *  the visual "search hit" cue a native <select>'s built-in type-ahead can't show. */
function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const startIndex = text.toLowerCase().indexOf(query.toLowerCase());
  if (startIndex === -1) return text;
  const endIndex = startIndex + query.length;
  return (
    <>
      {text.slice(0, startIndex)}
      <mark className="bg-amber-200/70 text-slate-900 rounded-sm px-0.5">
        {text.slice(startIndex, endIndex)}
      </mark>
      {text.slice(endIndex)}
    </>
  );
}

/**
 * Searchable replacement for a plain <select> — a native select's type-ahead jumps to a matching
 * option as you type, but shows neither the letters you typed nor which option matched. This shows
 * a real text input (so what you type is visible) and a dropdown of matching employees with the
 * matched substring highlighted, filtered live against name/role/department. Arrow keys move the
 * highlighted row, Enter picks it, Escape/outside-click closes without changing the selection.
 */
export default function TalentSearchSelect({ initialPage, selectedId, onSelect }: TalentSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [result, setResult] = useState(initialPage);
  const [page, setPage] = useState(initialPage.page);
  const [pageSize, setPageSize] = useState(initialPage.pageSize);
  const [loading, setLoading] = useState(false);
  const [selectedEmployeeState, setSelectedEmployeeState] = useState<Employee | undefined>(() => initialPage.items.find((employee) => employee.rowId === selectedId));
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedEmployee = result.items.find((emp) => emp.rowId === selectedId) ?? selectedEmployeeState;
  const label = (emp: Employee) => `${getCvDisplayName(emp)} (${emp.role})`;

  const filtered = result.items;

  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      setLoading(true);
      listEmployeesPageAction(page, pageSize, { search: query }).then(setResult).finally(() => setLoading(false));
    }, query ? 250 : 0);
    return () => clearTimeout(timer);
  }, [isOpen, query, page, pageSize]);

  // Closing (click outside / Escape) never changes the selection — only Enter or a click on an
  // option does. The input just falls back to showing the current selection's label.
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    setHighlightedIndex(0);
  }, [query, isOpen]);

  const openWithFreshQuery = () => {
    setQuery('');
    setPage(1);
    setIsOpen(true);
  };

  const commitSelection = (emp: Employee) => {
    setSelectedEmployeeState(emp);
    onSelect(emp.rowId, emp);
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        openWithFreshQuery();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const match = filtered[highlightedIndex];
      if (match) commitSelection(match);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          value={isOpen ? query : selectedEmployee ? label(selectedEmployee) : ''}
          onFocus={openWithFreshQuery}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Search by name, role, or department..."
          className="w-full bg-slate-50 border border-slate-200/80 rounded-xl pl-9 pr-9 py-3 text-xs font-semibold focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 transition-all text-slate-700 placeholder:text-slate-300"
        />
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {isOpen && (
        <div className="absolute z-20 mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-64 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-3 text-xs text-slate-400 italic">No matching employees.</p>
          ) : (
            filtered.map((emp, idx) => (
              <button
                key={emp.rowId}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => commitSelection(emp)}
                onMouseEnter={() => setHighlightedIndex(idx)}
                className={`w-full text-left px-4 py-2.5 text-xs transition-colors cursor-pointer flex items-center justify-between gap-2 ${
                  idx === highlightedIndex ? 'bg-indigo-50' : 'hover:bg-slate-50'
                } ${emp.rowId === selectedId ? 'font-black text-indigo-700' : 'font-semibold text-slate-700'}`}
              >
                <span className="truncate">
                  {highlightMatch(getCvDisplayName(emp), query)} <span className="text-slate-400 font-medium">({highlightMatch(emp.role, query)})</span>
                </span>
                <span className="text-[10px] text-slate-400 font-bold shrink-0">{highlightMatch(emp.department, query)}</span>
              </button>
            ))
          )}
          <Pagination page={page} pageSize={pageSize} total={result.total} disabled={loading}
            onPageChange={setPage} onPageSizeChange={(size) => { setPageSize(size); setPage(1); }} />
        </div>
      )}
    </div>
  );
}
