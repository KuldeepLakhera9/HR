import React from 'react';
import { cn } from '../lib/utils';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, helperText, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id || generatedId;
    const errorId = `${textareaId}-error`;
    const helperId = `${textareaId}-helper`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="block text-xs font-semibold text-stone-700 tracking-wide"
          >
            {label}
            {required && (
              <span className="text-rose-500 ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <textarea
          id={textareaId}
          ref={ref}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={cn(
            'w-full min-h-[90px] p-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600',
            'disabled:bg-stone-50 disabled:text-stone-400 disabled:cursor-not-allowed',
            error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-600',
            className,
          )}
          {...props}
        />
        {error && (
          <p id={errorId} role="alert" className="text-xs text-rose-600 font-medium">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-stone-500">
            {helperText}
          </p>
        )}
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
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, helperText, options, placeholder, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const selectId = id || generatedId;
    const errorId = `${selectId}-error`;
    const helperId = `${selectId}-helper`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-xs font-semibold text-stone-700 tracking-wide"
          >
            {label}
            {required && (
              <span className="text-rose-500 ml-0.5" aria-hidden="true">
                *
              </span>
            )}
          </label>
        )}
        <select
          id={selectId}
          ref={ref}
          required={required}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? errorId : helperText ? helperId : undefined}
          className={cn(
            'w-full h-10 px-3 rounded-lg border border-stone-200 bg-white text-sm text-stone-900',
            'transition-all duration-150',
            'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600',
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
        {error && (
          <p id={errorId} role="alert" className="text-xs text-rose-600 font-medium">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-stone-500">
            {helperText}
          </p>
        )}
      </div>
    );
  },
);

Select.displayName = 'Select';

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children?: React.ReactNode;
}

export const Label: React.FC<LabelProps> = ({ className, children, ...props }) => {
  return (
    <label
      className={cn('block text-xs font-semibold text-stone-700 tracking-wide', className)}
      {...props}
    >
      {children}
    </label>
  );
};
