/**
 * Enterprise HRMS Security Utility
 * Provides defensive sanitization routines for CSV export formula injection,
 * URL logging PII redaction, and sensitive identifier masking.
 */

// Formula Injection Trigger Characters (CWE-1236 / CSV Injection Mitigation)
const FORMULA_TRIGGER_REGEX = /^[=+\-@\t\r%]/;

/**
 * Sanitizes a cell value for CSV / Spreadsheet export to prevent formula injection (CWE-1236).
 * Any string beginning with =, +, -, @, tab, return, or % is prefixed with a single quote (').
 */
export function sanitizeCsvCell(val: unknown): string {
  if (val === null || val === undefined) {
    return '';
  }
  const raw = String(val);
  const trimmed = raw.trim();
  if (FORMULA_TRIGGER_REGEX.test(raw) || FORMULA_TRIGGER_REGEX.test(trimmed)) {
    return `'${raw}`;
  }
  return raw;
}

/**
 * Sanitizes an object of CSV row fields so that all string properties are protected against formula injection.
 */
export function sanitizeCsvRow<T extends Record<string, any>>(row: T): T {
  const cleanRow: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'string') {
      cleanRow[key] = sanitizeCsvCell(value);
    } else {
      cleanRow[key] = value;
    }
  }
  return cleanRow as T;
}

/**
 * Sanitizes an HTTP request URL string before logging to prevent leaking tokens, passwords,
 * or sensitive query parameters into persistent application logs (CWE-532).
 */
export function sanitizeUrlForLogging(rawUrl: string): string {
  if (!rawUrl) return '';
  try {
    const [path, queryString] = rawUrl.split('?');
    if (!queryString) return path;

    const params = new URLSearchParams(queryString);
    const SENSITIVE_PARAM_REGEX = /token|password|secret|key|code|auth|email|phone|cred|ssn|pan/i;

    for (const key of Array.from(params.keys())) {
      if (SENSITIVE_PARAM_REGEX.test(key)) {
        params.set(key, '[REDACTED]');
      }
    }
    return `${path}?${params.toString()}`;
  } catch {
    return rawUrl.split('?')[0];
  }
}

/**
 * Masks a sensitive financial or identity identifier (e.g. Bank Account, PAN, Aadhaar)
 * showing only trailing digits.
 */
export function maskSensitiveIdentifier(val: string | null | undefined, visibleEnd = 4): string {
  if (!val || typeof val !== 'string') return '';
  const clean = val.trim();
  if (clean.length <= visibleEnd) return '****';
  const maskedLength = clean.length - visibleEnd;
  return `${'*'.repeat(Math.min(maskedLength, 8))}${clean.slice(-visibleEnd)}`;
}
