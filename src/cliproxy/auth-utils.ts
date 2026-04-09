/**
 * Shared Authentication Utilities
 *
 * Common functions for OAuth token handling across quota fetchers.
 */

/**
 * Sanitize email to match CLIProxyAPI auth file naming convention.
 * Replaces @ and . with underscores for filesystem compatibility.
 */
export function sanitizeEmail(email: string): string {
  return email.replace(/@/g, '_').replace(/\./g, '_');
}

/**
 * Check if token is expired based on the expired timestamp.
 * Returns false if timestamp is missing or invalid (fail-open for quota display).
 */
export function getTokenExpiryTimestamp(expiredValue?: string | number | null): number | null {
  if (expiredValue === undefined || expiredValue === null || expiredValue === '') {
    return null;
  }

  try {
    if (typeof expiredValue === 'number') {
      return Number.isFinite(expiredValue) ? expiredValue : null;
    }

    const trimmed = expiredValue.trim();
    if (!trimmed) {
      return null;
    }

    if (/^\d+$/.test(trimmed)) {
      const numericTimestamp = Number(trimmed);
      return Number.isFinite(numericTimestamp) ? numericTimestamp : null;
    }

    const expiredDate = new Date(trimmed);
    const expiredAt = expiredDate.getTime();
    return Number.isNaN(expiredAt) ? null : expiredAt;
  } catch {
    return null;
  }
}

export function isTokenExpired(expiredValue?: string | number | null): boolean {
  const expiredAt = getTokenExpiryTimestamp(expiredValue);
  return expiredAt !== null ? expiredAt < Date.now() : false;
}
