import React from 'react';
import { cn } from '../lib/utils';
import { X } from 'lucide-react';

export interface DialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
}

export const Dialog: React.FC<DialogProps> = ({
  isOpen,
  onClose,
  title,
  description,
  children,
  footer,
  maxWidth = 'md',
}) => {
  if (!isOpen) return null;

  const maxWidths = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity animate-fade-in"
        onClick={onClose}
      />
      {/* Modal Dialog */}
      <div
        className={cn(
          'relative w-full bg-white rounded-xl shadow-2xl border border-stone-200 z-10 overflow-hidden transform transition-all',
          maxWidths[maxWidth],
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          <div>
            {title && <h3 className="text-base font-semibold text-stone-900">{title}</h3>}
            {description && <p className="text-xs text-stone-500 mt-0.5">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 rounded-lg p-1 hover:bg-stone-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 max-h-[75vh] overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-3.5 bg-stone-50/70 border-t border-stone-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  side?: 'left' | 'right';
}

export const Drawer: React.FC<DrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  side = 'right',
}) => {
  if (!isOpen) return null;

  const sideClasses =
    side === 'right' ? 'right-0 top-0 bottom-0 max-w-md' : 'left-0 top-0 bottom-0 max-w-md';

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="fixed inset-0 bg-stone-900/40 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />
      <div
        className={cn(
          'fixed w-full h-full bg-white shadow-2xl z-10 flex flex-col border-stone-200',
          side === 'right' ? 'border-l' : 'border-r',
          sideClasses,
        )}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
          {title && <h3 className="text-base font-semibold text-stone-900">{title}</h3>}
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-stone-600 rounded-lg p-1 hover:bg-stone-100 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 px-6 py-5 overflow-y-auto">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 bg-stone-50/70 border-t border-stone-100">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export interface DropdownItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

export interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
}

export const Dropdown: React.FC<DropdownProps> = ({ trigger, items, align = 'right' }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={containerRef}>
      <div onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 w-52 rounded-xl bg-white shadow-xl border border-stone-100 py-1.5 focus:outline-none animate-in fade-in zoom-in-95',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.id}
              disabled={item.disabled}
              onClick={() => {
                item.onClick();
                setIsOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-3.5 py-2 text-xs font-medium transition-colors text-left',
                item.danger
                  ? 'text-rose-600 hover:bg-rose-50'
                  : 'text-stone-700 hover:bg-stone-50 hover:text-stone-900',
                item.disabled && 'opacity-50 cursor-not-allowed',
              )}
            >
              {item.icon && <span className="h-4 w-4 shrink-0">{item.icon}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
