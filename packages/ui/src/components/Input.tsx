import React from 'react';
import { cn } from '../lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, helperText, leftIcon, rightIcon, id, required, ...props }, ref) => {
    const generatedId = React.useId();
    const inputId = id || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
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
        <div className="relative flex items-center">
          {leftIcon && (
            <div
              className="absolute left-3 flex items-center pointer-events-none text-stone-400"
              aria-hidden="true"
            >
              {leftIcon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            required={required}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={cn(
              'w-full h-10 px-3.5 rounded-lg border border-stone-200 bg-white text-sm text-stone-900 placeholder:text-stone-400',
              'transition-all duration-150',
              'focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-600 focus-visible:ring-2 focus-visible:ring-amber-500/20 focus-visible:border-amber-600',
              'disabled:bg-stone-50 disabled:text-stone-400 disabled:cursor-not-allowed',
              leftIcon && 'pl-9',
              rightIcon && 'pr-9',
              error && 'border-rose-500 focus:ring-rose-500/20 focus:border-rose-600',
              className,
            )}
            {...props}
          />
          {rightIcon && (
            <div
              className="absolute right-3 flex items-center pointer-events-none text-stone-400"
              aria-hidden="true"
            >
              {rightIcon}
            </div>
          )}
        </div>
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

Input.displayName = 'Input';
