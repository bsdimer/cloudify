/**
 * Pagination helpers — consistent pagination across all services.
 */

export interface PaginationQuery {
  page?: number;
  perPage?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResult<T> {
  data: T[];
  meta: PaginationMeta;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;
const MAX_PER_PAGE = 100;

/**
 * Normalize raw pagination query params into safe values.
 */
export function normalizePagination(query: PaginationQuery): Required<
  Pick<PaginationQuery, 'page' | 'perPage'>
> & {
  offset: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
} {
  const page = Math.max(1, Math.floor(query.page ?? DEFAULT_PAGE));
  const perPage = Math.min(
    MAX_PER_PAGE,
    Math.max(1, Math.floor(query.perPage ?? DEFAULT_PER_PAGE)),
  );
  const offset = (page - 1) * perPage;
  const sortBy = query.sortBy ?? 'createdAt';
  const sortOrder = query.sortOrder === 'desc' ? 'desc' : 'asc';

  return { page, perPage, offset, sortBy, sortOrder };
}

/**
 * Build a PaginatedResult from rows + total count.
 */
export function paginate<T>(
  rows: T[],
  total: number,
  page: number,
  perPage: number,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / perPage);

  return {
    data: rows,
    meta: {
      page,
      perPage,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}
