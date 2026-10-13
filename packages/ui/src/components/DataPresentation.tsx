import React from 'react';
import { cn } from '../lib/utils';
import {
  Search as SearchIcon,
  Filter as FilterIcon,
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Inbox,
  X,
} from 'lucide-react';

export const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div
      className="relative w-full overflow-x-auto rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/20"
      tabIndex={0}
      role="region"
      aria-label="Scrollable table"
    >
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  ),
);
Table.displayName = 'Table';

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead
    ref={ref}
    className={cn('border-b border-stone-200 bg-stone-50/70', className)}
    {...props}
  />
));
TableHeader.displayName = 'TableHeader';

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
));
TableBody.displayName = 'TableBody';

export const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn('border-b border-stone-100 transition-colors hover:bg-stone-50/50', className)}
    {...props}
  />
));
TableRow.displayName = 'TableRow';

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, scope = 'col', ...props }, ref) => (
  <th
    ref={ref}
    scope={scope}
    className={cn(
      'h-11 px-4 text-left align-middle font-semibold text-xs text-stone-600 uppercase tracking-wider',
      className,
    )}
    {...props}
  />
));
TableHead.displayName = 'TableHead';

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td ref={ref} className={cn('p-4 align-middle text-stone-800 text-sm', className)} {...props} />
));
TableCell.displayName = 'TableCell';

export interface Column<T> {
  key?: string;
  header: React.ReactNode;
  render?: (row: T) => React.ReactNode;
  accessor?: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  emptyMessage?: string;
  isLoading?: boolean;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends { id?: string | number }>({
  columns,
  data,
  emptyMessage = 'No records found.',
  isLoading = false,
  onRowClick,
}: DataTableProps<T>) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden shadow-xs">
      <Table aria-busy={isLoading}>
        <TableHeader>
          <TableRow>
            {columns.map((col, cIdx) => (
              <TableHead key={col.key || `header-${cIdx}`}>{col.header}</TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            Array.from({ length: 4 }).map((_, rIdx) => (
              <TableRow key={`skeleton-row-${rIdx}`}>
                {columns.map((col, cIdx) => (
                  <TableCell key={col.key || `skeleton-cell-${rIdx}-${cIdx}`}>
                    <div className="h-4 bg-stone-100 rounded-md animate-pulse w-3/4" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : data.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-36 text-center text-stone-400">
                <div className="flex flex-col items-center justify-center py-4">
                  <div className="p-2.5 rounded-full bg-stone-100 text-stone-400 mb-2">
                    <Inbox className="h-5 w-5" />
                  </div>
                  <span className="text-xs font-semibold text-stone-600">{emptyMessage}</span>
                  <span className="text-[11px] text-stone-400 mt-0.5">
                    No data matching current criteria
                  </span>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            data.map((row, index) => (
              <TableRow
                key={row.id ? String(row.id) : index}
                className={
                  onRowClick ? 'cursor-pointer hover:bg-amber-50/40 transition-colors' : undefined
                }
                onClick={() => onRowClick?.(row)}
              >
                {columns.map((col, cIdx) => (
                  <TableCell key={col.key || `cell-${cIdx}`}>
                    {col.render
                      ? col.render(row)
                      : col.accessor
                        ? col.accessor(row)
                        : col.key
                          ? (row as Record<string, any>)[col.key]
                          : null}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}

// Search Component
export interface SearchProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  'aria-label'?: string;
}

export const Search: React.FC<SearchProps> = ({
  value,
  onChange,
  placeholder = 'Search...',
  className,
  'aria-label': ariaLabel,
}) => {
  return (
    <div className={cn('relative w-full max-w-sm', className)}>
      <SearchIcon
        className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 pointer-events-none"
        aria-hidden="true"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel || placeholder || 'Search records'}
        className="w-full h-9 pl-9 pr-8 rounded-lg border border-stone-200 bg-white text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600 transition-all"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search query"
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

// Filter Component
export interface FilterProps {
  options: { label: string; value: string }[];
  selectedValue: string;
  onChange: (value: string) => void;
  label?: string;
  id?: string;
}

export const Filter: React.FC<FilterProps> = ({ options, selectedValue, onChange, label, id }) => {
  const generatedId = React.useId();
  const filterId = id || generatedId;

  return (
    <div className="flex items-center gap-2">
      <div className="flex items-center gap-1.5 text-xs text-stone-500 font-medium">
        <FilterIcon className="h-3.5 w-3.5 text-stone-400" aria-hidden="true" />
        {label && <label htmlFor={filterId}>{label}:</label>}
      </div>
      <select
        id={filterId}
        value={selectedValue}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label || 'Filter'}
        className="h-8 px-2.5 rounded-lg border border-stone-200 bg-white text-xs font-medium text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
};

// DatePicker Component
export interface DatePickerProps {
  value: string;
  onChange: (date: string) => void;
  label?: string;
  className?: string;
  id?: string;
}

export const DatePicker: React.FC<DatePickerProps> = ({
  value,
  onChange,
  label,
  className,
  id,
}) => {
  const generatedId = React.useId();
  const dateId = id || generatedId;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {label && (
        <label htmlFor={dateId} className="text-xs font-medium text-stone-600">
          {label}
        </label>
      )}
      <div className="relative">
        <CalendarIcon
          className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none"
          aria-hidden="true"
        />
        <input
          id={dateId}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label={label || 'Select date'}
          className="h-8 pl-8 pr-2.5 rounded-lg border border-stone-200 bg-white text-xs text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600 cursor-pointer"
        />
      </div>
    </div>
  );
};

// Pagination Component
export interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  onPageChange,
}) => {
  return (
    <nav aria-label="Pagination Navigation" className="flex items-center justify-between px-2 py-3">
      <p className="text-xs text-stone-500" aria-live="polite">
        Page <span className="font-semibold text-stone-800">{currentPage}</span> of{' '}
        <span className="font-semibold text-stone-800">{totalPages}</span>
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label="Previous page"
          className="p-1.5 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label="Next page"
          className="p-1.5 rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
};
