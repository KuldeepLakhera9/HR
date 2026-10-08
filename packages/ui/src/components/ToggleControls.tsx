import React from 'react';
import { cn } from '../lib/utils';

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, label, description, id, checked, ...props }, ref) => {
    const checkId = id || React.useId();

    return (
      <div className="flex items-start gap-2.5">
        <div className="relative flex items-center pt-0.5">
          <input
            id={checkId}
            ref={ref}
            type="checkbox"
            checked={checked}
            className={cn(
              'peer h-4 w-4 shrink-0 rounded border border-stone-300 bg-white text-amber-600',
              'focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:ring-offset-1',
              'checked:bg-amber-600 checked:border-amber-600',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <label htmlFor={checkId} className="select-none text-sm cursor-pointer">
            {label && <span className="font-medium text-stone-800 block">{label}</span>}
            {description && <span className="text-xs text-stone-500 block">{description}</span>}
          </label>
        )}
      </div>
    );
  },
);

Checkbox.displayName = 'Checkbox';

export interface RadioProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Radio = React.forwardRef<HTMLInputElement, RadioProps>(
  ({ className, label, description, id, ...props }, ref) => {
    const radioId = id || React.useId();

    return (
      <div className="flex items-start gap-2.5">
        <div className="relative flex items-center pt-0.5">
          <input
            id={radioId}
            ref={ref}
            type="radio"
            className={cn(
              'peer h-4 w-4 rounded-full border border-stone-300 bg-white text-amber-600',
              'focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:ring-offset-1',
              'checked:border-amber-600 checked:bg-amber-600',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            {...props}
          />
        </div>
        {(label || description) && (
          <label htmlFor={radioId} className="select-none text-sm cursor-pointer">
            {label && <span className="font-medium text-stone-800 block">{label}</span>}
            {description && <span className="text-xs text-stone-500 block">{description}</span>}
          </label>
        )}
      </div>
    );
  },
);

Radio.displayName = 'Radio';

export interface SwitchProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  description?: string;
}

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, label, description, id, checked, onChange, disabled, ...props }, ref) => {
    const switchId = id || React.useId();

    return (
      <div className="flex items-center justify-between gap-3">
        {(label || description) && (
          <label htmlFor={switchId} className="select-none text-sm cursor-pointer">
            {label && <span className="font-medium text-stone-800 block">{label}</span>}
            {description && <span className="text-xs text-stone-500 block">{description}</span>}
          </label>
        )}
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            id={switchId}
            ref={ref}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            className="sr-only peer"
            {...props}
          />
          <div
            className={cn(
              'w-11 h-6 bg-stone-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-amber-500/30 rounded-full peer',
              'peer-checked:after:translate-x-full peer-checked:after:border-white peer-checked:bg-amber-600',
              "after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all",
              disabled && 'opacity-50 cursor-not-allowed',
              className,
            )}
          />
        </label>
      </div>
    );
  },
);

Switch.displayName = 'Switch';
