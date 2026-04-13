function toDate(value: string | Date | null | undefined): Date | null {
  if (value == null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function formatDate(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function formatRelative(value: string | Date | null | undefined): string {
  const date = toDate(value);
  if (!date) return '';

  const now = Date.now();
  const diffMs = date.getTime() - now;
  const diffSec = Math.round(diffMs / 1000);
  const absSec = Math.abs(diffSec);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

  if (absSec < 45) {
    return rtf.format(diffSec === 0 ? 0 : diffSec < 0 ? -1 : 1, 'second').replace('1 second ago', 'just now').replace('in 1 second', 'just now');
  }

  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 45) {
    return rtf.format(diffMin, 'minute');
  }

  const diffHour = Math.round(diffSec / 3600);
  if (Math.abs(diffHour) < 22) {
    return rtf.format(diffHour, 'hour');
  }

  const diffDay = Math.round(diffSec / 86400);
  if (Math.abs(diffDay) < 30) {
    return rtf.format(diffDay, 'day');
  }

  return formatDate(date);
}
