import { formatCurrency, formatDate, formatStatusLabel } from '../lib/formatters';

describe('Frontend Formatting & Display Utilities', () => {
  describe('formatCurrency', () => {
    it('should format standard amounts in INR currency representation', () => {
      const res = formatCurrency(150000);
      expect(res).toContain('1,50,000.00');
    });

    it('should handle zero, null, undefined, empty string, and NaN safely', () => {
      expect(formatCurrency(0)).toContain('0.00');
      expect(formatCurrency(null)).toContain('0.00');
      expect(formatCurrency(undefined)).toContain('0.00');
      expect(formatCurrency('')).toContain('0.00');
      expect(formatCurrency(NaN)).toContain('0.00');
    });

    it('should format numeric strings and decimals correctly', () => {
      const res = formatCurrency('45250.75');
      expect(res).toContain('45,250.75');
    });
  });

  describe('formatDate', () => {
    it('should format valid ISO date strings to YYYY-MM-DD', () => {
      expect(formatDate('2026-10-13T05:30:00.000Z')).toBe('2026-10-13');
      expect(formatDate(new Date('2026-05-01'))).toBe('2026-05-01');
    });

    it('should return fallback dash for null, undefined, or invalid dates', () => {
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
      expect(formatDate('invalid-date')).toBe('-');
    });
  });

  describe('formatStatusLabel', () => {
    it('should convert uppercase snake_case enum values to title case strings', () => {
      expect(formatStatusLabel('REVIEW_PENDING')).toBe('Review Pending');
      expect(formatStatusLabel('APPROVED')).toBe('Approved');
      expect(formatStatusLabel('LOCKED')).toBe('Locked');
      expect(formatStatusLabel('ON_NOTICE')).toBe('On Notice');
    });

    it('should handle null and undefined safely', () => {
      expect(formatStatusLabel(null)).toBe('-');
      expect(formatStatusLabel(undefined)).toBe('-');
    });
  });
});
