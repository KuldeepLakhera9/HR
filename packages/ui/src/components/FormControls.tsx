import React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, ...props }, ref) => {
    const textareaId = id || React.useId();

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-semibold text-stone-700 tracking-wide"
          >
            {label}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          className={cn(
            'w-full min-h-[90px] p-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600',
            'disabled:bg-stone-50 disabled:text-stone-400 disabled:cursor-not-allowed',
            error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-600',
            className,
          )}
          {...props}
        />
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
        {helperText && !error && <p className="text-xs text-stone-500">{helperText}</p>}
      </div>
    );
  },
);

Textarea.displayName = 'Textarea';

export interface SelectOption {
  label: string;
  value: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, options, placeholder, id, ...props }, ref) => {
    const selectId = id || React.useId();

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-stone-700 tracking-wide"
          >
            {label}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          className={cn(
            'w-full h-10 px-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600',
            'disabled:bg-stone-50 disabled:text-stone-400 disabled:cursor-not-allowed',
            error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-600',
            className,
          )}
          {...props}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-rose-600 font-medium">{error}</p>}
      </div>
    );
  },
);

Select.displayName = 'Select';
