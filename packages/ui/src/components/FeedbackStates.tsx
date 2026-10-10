import React from 'react';
import { cn } from '../lib/utils';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  Loader2,
  Sparkles,
  Bell,
  User,
} from 'lucide-react';
import { Button } from './Button';
import { Avatar } from './DisplayElements';

// Skeleton
export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className, ...props }) => {
  return <div className={cn('animate-pulse rounded-md bg-stone-200/70', className)} {...props} />;
};

// EmptyState
export interface EmptyStateProps {
  title: string;
  description: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  title,
  description,
  icon,
  action,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-dashed border-stone-300 bg-white/50',
        className,
      )}
    >
      <div className="p-3 bg-amber-50 text-amber-700 rounded-2xl mb-3 shadow-2xs">
        {icon || <Sparkles className="h-6 w-6" />}
      </div>
      <h4 className="text-sm font-semibold text-stone-900">{title}</h4>
      <p className="text-xs text-stone-500 mt-1 max-w-sm">{description}</p>
      {action && (
        <Button size="sm" onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
};

// ErrorState
export interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  title = 'Something went wrong',
  message,
  onRetry,
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-8 text-center rounded-xl border border-rose-200 bg-rose-50/50',
        className,
      )}
    >
      <div className="p-3 bg-rose-100 text-rose-600 rounded-full mb-3">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h4 className="text-sm font-semibold text-rose-900">{title}</h4>
      <p className="text-xs text-rose-700 mt-1 max-w-sm">{message}</p>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry} className="mt-4">
          Try Again
        </Button>
      )}
    </div>
  );
};

// LoadingState
export interface LoadingStateProps {
  message?: string;
  className?: string;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading data...',
  className,
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center p-12 text-center text-stone-500',
        className,
      )}
    >
      <Loader2 className="h-7 w-7 animate-spin text-amber-600 mb-2.5" />
      <p className="text-xs font-medium text-stone-600">{message}</p>
    </div>
  );
};

// Toast
export interface ToastProps {
  type?: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message?: string;
  onClose?: () => void;
}

export const Toast: React.FC<ToastProps> = ({ type = 'info', title, message, onClose }) => {
  const configs = {
    success: {
      icon: CheckCircle,
      border: 'border-emerald-200',
      bg: 'bg-emerald-50',
      text: 'text-emerald-800',
    },
    warning: {
      icon: AlertTriangle,
      border: 'border-amber-200',
      bg: 'bg-amber-50',
      text: 'text-amber-800',
    },
    error: {
      icon: AlertCircle,
      border: 'border-rose-200',
      bg: 'bg-rose-50',
      text: 'text-rose-800',
    },
    info: { icon: Info, border: 'border-sky-200', bg: 'bg-sky-50', text: 'text-sky-800' },
  };

  const config = configs[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-3.5 rounded-xl border shadow-lg max-w-sm bg-white',
        config.border,
      )}
    >
      <div className={cn('p-1 rounded-md shrink-0', config.bg, config.text)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1">
        <h5 className="text-xs font-semibold text-stone-900">{title}</h5>
        {message && <p className="text-xs text-stone-600 mt-0.5">{message}</p>}
      </div>
      {onClose && (
        <button
          onClick={onClose}
          className="text-stone-400 hover:text-stone-600 text-xs ml-2 cursor-pointer"
        >
          ✕
        </button>
      )}
    </div>
  );
};

// ActivityItem
export interface ActivityItemProps {
  actorName: string;
  action: string;
  target?: string;
  timestamp: string;
  type?: 'auth' | 'org' | 'attendance' | 'system';
}

export const ActivityItem: React.FC<ActivityItemProps> = ({
  actorName,
  action,
  target,
  timestamp,
}) => {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-stone-100 last:border-0">
      <Avatar name={actorName} size="sm" />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-stone-800 leading-snug">
          <span className="font-semibold text-stone-900">{actorName}</span> {action}{' '}
          {target && <span className="font-medium text-amber-700">{target}</span>}
        </p>
        <span className="text-[11px] text-stone-400 mt-0.5 block">{timestamp}</span>
      </div>
    </div>
  );
};

// UserMenu
export interface UserMenuProps {
  name: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
  onLogout?: () => void;
  onProfileClick?: () => void;
}

export const UserMenu: React.FC<UserMenuProps> = ({
  name,
  email,
  role,
  avatarUrl,
  onLogout,
  onProfileClick,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="User Profile Menu"
        className="flex items-center gap-2.5 p-1 rounded-xl hover:bg-stone-100 transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-amber-500/20"
      >
        <Avatar name={name} src={avatarUrl} size="sm" status="online" />
        <div className="hidden md:block">
          <p className="text-xs font-semibold text-stone-800 leading-none">{name}</p>
          <span className="text-[10px] font-medium text-amber-700 uppercase tracking-wider">
            {role}
          </span>
        </div>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="absolute right-0 mt-2 w-56 rounded-xl bg-white shadow-xl border border-stone-100 py-2 z-50 animate-in fade-in zoom-in-95"
        >
          <div className="px-4 py-2 border-b border-stone-100">
            <p className="text-xs font-semibold text-stone-900">{name}</p>
            <p className="text-[11px] text-stone-500 truncate">{email}</p>
            <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-800">
              Role: {role}
            </span>
          </div>
          <button
            role="menuitem"
            onClick={() => {
              setIsOpen(false);
              onProfileClick?.();
            }}
            className="w-full text-left px-4 py-2 text-xs text-stone-700 hover:bg-stone-50 flex items-center gap-2 transition-colors cursor-pointer"
          >
            <User className="h-3.5 w-3.5 text-stone-400" />
            My Profile
          </button>
          <div className="border-t border-stone-100 mt-1 pt-1">
            <button
              role="menuitem"
              onClick={() => {
                setIsOpen(false);
                onLogout?.();
              }}
              className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 font-medium transition-colors cursor-pointer"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// NotificationMenu
export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  isRead: boolean;
  link?: string | null;
  type?: string;
  metadata?: any;
}

export interface NotificationMenuProps {
  notifications: NotificationItem[];
  onMarkAllRead?: () => void;
  onSelectNotification?: (item: NotificationItem) => void;
}

export const NotificationMenu: React.FC<NotificationMenuProps> = ({
  notifications,
  onMarkAllRead,
  onSelectNotification,
}) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-haspopup="true"
        aria-expanded={isOpen}
        aria-label={`Notifications, ${unreadCount} unread`}
        className="relative p-2 rounded-xl text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-amber-500/20"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-600 ring-2 ring-white" />
        )}
      </button>

      {isOpen && (
        <div
          role="region"
          aria-label="Notifications Panel"
          className="absolute right-0 mt-2 w-80 rounded-xl bg-white shadow-xl border border-stone-100 py-2 z-50 animate-in fade-in zoom-in-95"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b border-stone-100">
            <h5 className="text-xs font-semibold text-stone-900">Notifications</h5>
            {unreadCount > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-[11px] text-amber-700 hover:underline font-medium cursor-pointer"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-stone-400 text-center py-6">No new notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  onClick={() => {
                    if (onSelectNotification) {
                      onSelectNotification(n);
                    } else if (n.link) {
                      window.location.href = n.link;
                    }
                    setIsOpen(false);
                  }}
                  className={cn(
                    'px-4 py-2.5 border-b border-stone-50 hover:bg-stone-50 transition-colors cursor-pointer',
                    !n.isRead && 'bg-amber-50/30',
                  )}
                >
                  <p className="text-xs font-medium text-stone-800">{n.title}</p>
                  <p className="text-[11px] text-stone-500 line-clamp-1">{n.message}</p>
                  <span className="text-[10px] text-stone-400 mt-1 block">{n.time}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
