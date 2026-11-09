export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 20;

export interface PaginationParams {
  page: number;
  pageSize: number;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export function normalizePagination(page: number, pageSize: number): PaginationParams {
  return {
    page: Number.isFinite(page) ? Math.max(1, Math.trunc(page)) : 1,
    pageSize: PAGE_SIZE_OPTIONS.includes(pageSize as (typeof PAGE_SIZE_OPTIONS)[number])
      ? pageSize
      : DEFAULT_PAGE_SIZE,
  };
}

export function pageRange(page: number, pageSize: number) {
  const normalized = normalizePagination(page, pageSize);
  const from = (normalized.page - 1) * normalized.pageSize;
  return { ...normalized, from, to: from + normalized.pageSize - 1 };
}
