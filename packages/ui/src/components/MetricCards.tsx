import React from 'react';
import { cn } from '../lib/utils';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from './LayoutCards';

export interface KPICardProps {
  title: string;
  value: string | number;
  change?: {
    value: string | number;
    trend: 'up' | 'down' | 'neutral';
    label?: string;
  };
  icon?: React.ReactNode;
  iconBg?: string;
  description?: string;
  className?: string;
  onClick?: () => void;
}

export const KPICard: React.FC<KPICardProps> = ({
  title,
  value,
  change,
  icon,
  iconBg = 'bg-amber-50 text-amber-700',
  description,
  className,
  onClick,
}) => {
  return (
    <div
      onClick={onClick}
      className={cn(
        'p-5 rounded-xl border border-stone-200/90 bg-white shadow-xs hover:border-amber-400/40 hover:shadow-md transition-all duration-200',
        onClick && 'cursor-pointer',
        className,
      )}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-stone-500">{title}</p>
          <div className="text-2xl font-bold tracking-tight text-stone-900">{value}</div>
        </div>
        {icon && (
          <div
            className={cn(
              'p-2.5 rounded-xl flex items-center justify-center shrink-0 shadow-2xs',
              iconBg,
            )}
          >
            {icon}
          </div>
        )}
      </div>

      {(change || description) && (
        <div className="mt-3.5 flex items-center gap-2 pt-2 border-t border-stone-100 text-xs">
          {change && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold px-1.5 py-0.5 rounded text-[11px]',
                change.trend === 'up' && 'text-emerald-700 bg-emerald-50',
                change.trend === 'down' && 'text-rose-700 bg-rose-50',
                change.trend === 'neutral' && 'text-stone-600 bg-stone-100',
              )}
            >
              {change.trend === 'up' && <TrendingUp className="h-3 w-3" />}
              {change.trend === 'down' && <TrendingDown className="h-3 w-3" />}
              {change.trend === 'neutral' && <Minus className="h-3 w-3" />}
              {change.value}
            </span>
          )}
          <span className="text-stone-500 truncate">{change?.label || description}</span>
        </div>
      )}
    </div>
  );
};

export interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({
  title,
  value,
  subtitle,
  icon,
  badge,
  className,
}) => {
  return (
    <div
      className={cn(
        'p-4 rounded-xl border border-stone-200 bg-white flex items-center justify-between',
        className,
      )}
    >
      <div className="flex items-center gap-3.5">
        {icon && <div className="p-2 bg-stone-100 rounded-lg text-stone-600 shrink-0">{icon}</div>}
        <div>
          <p className="text-xs font-medium text-stone-500">{title}</p>
          <p className="text-lg font-bold text-stone-900">{value}</p>
          {subtitle && <p className="text-xs text-stone-400 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {badge && <div>{badge}</div>}
    </div>
  );
};

export interface ChartCardProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<ChartCardProps> = ({
  title,
  subtitle,
  action,
  children,
  className,
}) => {
  return (
    <Card className={cn('flex flex-col', className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div>
          <CardTitle>{title}</CardTitle>
          {subtitle && <CardDescription>{subtitle}</CardDescription>}
        </div>
        {action && <div>{action}</div>}
      </CardHeader>
      <CardContent className="pt-2 flex-1 min-h-[260px]">{children}</CardContent>
    </Card>
  );
};
