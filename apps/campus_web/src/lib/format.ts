const DATE = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const DATE_TIME = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' });

export function formatDate(d: Date | null | undefined): string {
  return d ? DATE.format(d) : '';
}

export function formatDateTime(d: Date | null | undefined): string {
  return d ? DATE_TIME.format(d) : '';
}

export function formatTime(d: Date | null | undefined): string {
  return d ? TIME.format(d) : '';
}

export function formatRange(start: Date, end: Date): string {
  const sameDay = start.toDateString() === end.toDateString();
  return sameDay ? `${DATE_TIME.format(start)} - ${TIME.format(end)}` : `${DATE_TIME.format(start)} - ${DATE_TIME.format(end)}`;
}

export function timeAgo(d: Date | null | undefined, now = new Date()): string {
  if (!d) return '';
  const s = Math.round((now.getTime() - d.getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} d ago`;
  return formatDate(d);
}
