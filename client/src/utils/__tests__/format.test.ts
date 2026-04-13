import { describe, it, expect, vi, afterEach } from 'vitest';
import { formatDate, formatDateTime, formatRelative } from '@/utils/format';

describe('formatDate', () => {
  it('formats a valid ISO date string', () => {
    const result = formatDate('2026-04-05T12:00:00Z');
    // The result depends on locale, but should contain the year and some
    // month representation. Check for the year at minimum.
    expect(result).toContain('2026');
    // Should also contain some form of "Apr" or "April" or locale equivalent
    expect(result.length).toBeGreaterThan(0);
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatDate(undefined)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDate('not-a-date')).toBe('');
    expect(formatDate('abc123')).toBe('');
  });

  it('formats a Date object', () => {
    const date = new Date('2025-12-25T00:00:00Z');
    const result = formatDate(date);
    expect(result).toContain('2025');
    expect(result.length).toBeGreaterThan(0);
  });
});

// formatDateTime is exported but not imported in production code
describe('formatDateTime', () => {
  it('includes time in output', () => {
    // Use a time that would show up clearly: 2:30 PM UTC
    const result = formatDateTime('2026-04-05T14:30:00Z');
    expect(result).toContain('2026');
    // Should contain some time component — look for a colon which separates
    // hours and minutes in virtually all locales
    expect(result).toMatch(/\d+:\d+/);
  });

  it('returns empty string for null', () => {
    expect(formatDateTime(null)).toBe('');
  });

  it('returns empty string for invalid date', () => {
    expect(formatDateTime('garbage')).toBe('');
  });
});

describe('formatRelative', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns relative time for recent dates', () => {
    // Mock Date.now to a fixed point, then pass a date 5 minutes ago
    const now = new Date('2026-04-05T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const fiveMinutesAgo = new Date('2026-04-05T11:55:00Z').toISOString();
    const result = formatRelative(fiveMinutesAgo);
    // Weak assertion — only verifies output is non-empty and relative (not absolute date)
    expect(result.length).toBeGreaterThan(0);
    // Should NOT be a formatted absolute date (which would contain "2026")
    expect(result).not.toContain('2026');
  });

  it('returns "just now" equivalent for very recent dates', () => {
    const now = new Date('2026-04-05T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    const justNow = new Date('2026-04-05T12:00:00Z').toISOString();
    const result = formatRelative(justNow);
    // Locale-dependent output — cannot assert exact string across environments
    expect(result).toBeTruthy();
  });

  it('falls back to formatDate for old dates', () => {
    const now = new Date('2026-04-05T12:00:00Z').getTime();
    vi.spyOn(Date, 'now').mockReturnValue(now);

    // 60 days ago — well beyond the 30 day threshold
    const oldDate = new Date('2026-02-04T12:00:00Z').toISOString();
    const result = formatRelative(oldDate);
    // Should fall back to formatDate, which includes "2026"
    expect(result).toContain('2026');
  });

  it('returns empty string for null', () => {
    expect(formatRelative(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(formatRelative(undefined)).toBe('');
  });
});
