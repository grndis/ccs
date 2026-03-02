import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  formatQuotaResetTimestamp,
  formatRelativeTime,
  getErrorTypeLabel,
} from '@/lib/error-log-parser';

describe('error-log-parser locale formatting', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats relative time in Vietnamese', () => {
    const nowSeconds = Math.floor(Date.now() / 1000);

    expect(formatRelativeTime(nowSeconds - 10, 'vi')).toBe('vừa xong');
    expect(formatRelativeTime(nowSeconds - 120, 'vi')).toBe('2 phút trước');
    expect(formatRelativeTime(nowSeconds - 7200, 'vi')).toBe('2 giờ trước');
  });

  it('returns localized error labels for Vietnamese', () => {
    expect(getErrorTypeLabel('rate_limit', 'vi')).toBe('Quá giới hạn');
    expect(getErrorTypeLabel('auth', 'vi')).toBe('Lỗi xác thực');
    expect(getErrorTypeLabel('unknown', 'vi')).toBe('Lỗi');
  });

  it('formats quota reset timestamp in Vietnamese', () => {
    expect(formatQuotaResetTimestamp('2026-01-01T00:00:45.000Z', 'vi')).toBe('45 giây');
    expect(formatQuotaResetTimestamp('2026-01-01T00:05:00.000Z', 'vi')).toBe('5 phút');
    expect(formatQuotaResetTimestamp('2026-01-01T02:05:00.000Z', 'vi')).toBe('2 giờ 5 phút');
    expect(formatQuotaResetTimestamp('2025-12-31T23:59:58.000Z', 'vi')).toBe('bây giờ');
  });
});
