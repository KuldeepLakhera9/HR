/**
 * Centralized formatting utilities for enterprise UI display
 */

/**
 * Formats a monetary value to Indian Rupee (INR) currency representation
 */
export function formatCurrency(amount: number | string | undefined | null): string {
  if (amount === undefined || amount === null || amount === '') return '₹0.00';
  const numeric = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(numeric)) return '₹0.00';

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric);
}

/**
 * Formats an ISO date string or Date object to localized YYYY-MM-DD or readable format
 */
export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '-';
    return d.toISOString().split('T')[0];
  } catch {
    return '-';
  }
}

/**
 * Formats enum values (e.g., REVIEW_PENDING) into clean title case labels (e.g., Review Pending)
 */
export function formatStatusLabel(status: string | null | undefined): string {
  if (!status) return '-';
  return status
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
