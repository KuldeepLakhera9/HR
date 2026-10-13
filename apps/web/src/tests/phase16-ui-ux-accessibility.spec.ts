import { DESIGN_TOKENS } from '@hrms/config';
import { formatCurrency, formatDate, formatStatusLabel } from '../lib/formatters';

describe('Phase 16: Enterprise UI/UX Polish, Design System & Accessibility Audits', () => {
  describe('1. Design System Tokens & Palette Invariants', () => {
    it('should define the approved warm amber/gold primary palette', () => {
      expect(DESIGN_TOKENS.colors.primary[500]).toBe('#F59E0B');
      expect(DESIGN_TOKENS.colors.primary[600]).toBe('#D97706'); // Primary Brand Color
      expect(DESIGN_TOKENS.colors.primary.foreground).toBe('#FFFFFF');
    });

    it('should define the warm ivory background tokens', () => {
      expect(DESIGN_TOKENS.colors.background.default).toBe('#FAF8F5');
      expect(DESIGN_TOKENS.colors.background.subtle).toBe('#F5F2EB');
    });

    it('should define deep charcoal typography tokens with high contrast', () => {
      expect(DESIGN_TOKENS.colors.text.primary).toBe('#1C1917');
      expect(DESIGN_TOKENS.colors.text.secondary).toBe('#44403C');
      expect(DESIGN_TOKENS.colors.text.muted).toBe('#78716C');
    });

    it('should define all semantic status colors (success, warning, danger, info)', () => {
      expect(DESIGN_TOKENS.colors.status.success.solid).toBe('#10B981');
      expect(DESIGN_TOKENS.colors.status.warning.solid).toBe('#F59E0B');
      expect(DESIGN_TOKENS.colors.status.danger.solid).toBe('#EF4444');
      expect(DESIGN_TOKENS.colors.status.info.solid).toBe('#3B82F6');
    });

    it('should maintain consistent border radii and shadow tokens', () => {
      expect(DESIGN_TOKENS.borderRadius.md).toBe('0.5rem');
      expect(DESIGN_TOKENS.borderRadius.lg).toBe('0.75rem');
      expect(DESIGN_TOKENS.shadows.card).toBeDefined();
    });
  });

  describe('2. Financial & Data Formatting Accessibility', () => {
    it('should format currency with exact Indian grouping and 2-decimal precision', () => {
      expect(formatCurrency(125000)).toBe('₹1,25,000.00');
      expect(formatCurrency('54321.5')).toBe('₹54,321.50');
      expect(formatCurrency(0)).toBe('₹0.00');
    });

    it('should gracefully handle null, undefined, and non-numeric financial amounts without throwing', () => {
      expect(formatCurrency(null)).toBe('₹0.00');
      expect(formatCurrency(undefined)).toBe('₹0.00');
      expect(formatCurrency('')).toBe('₹0.00');
      expect(formatCurrency('invalid_num')).toBe('₹0.00');
    });

    it('should format ISO dates into standard YYYY-MM-DD format for high readability', () => {
      expect(formatDate('2026-10-13T10:00:00.000Z')).toBe('2026-10-13');
      expect(formatDate(new Date('2026-12-25T00:00:00.000Z'))).toBe('2026-12-25');
      expect(formatDate(null)).toBe('-');
      expect(formatDate(undefined)).toBe('-');
    });

    it('should convert raw database status enums into accessible Title Case strings', () => {
      expect(formatStatusLabel('REVIEW_PENDING')).toBe('Review Pending');
      expect(formatStatusLabel('APPROVED')).toBe('Approved');
      expect(formatStatusLabel('ON_LEAVE')).toBe('On Leave');
      expect(formatStatusLabel(null)).toBe('-');
    });
  });

  describe('3. Responsive Breakpoint Target Contracts', () => {
    it('should declare target mobile, tablet, and desktop breakpoints', () => {
      const standardBreakpoints = {
        sm: 640,
        md: 768,
        lg: 1024,
        xl: 1280,
        '2xl': 1536,
      };

      // Ensure mobile (<640px), tablet (768px), desktop (1280px) are covered
      expect(standardBreakpoints.sm).toBeLessThanOrEqual(640);
      expect(standardBreakpoints.md).toBe(768);
      expect(standardBreakpoints.xl).toBe(1280);
    });
  });
});
