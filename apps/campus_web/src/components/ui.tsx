'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

const BUTTON = {
  base: 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-700 hover:bg-slate-100',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
  accent: 'bg-saffron-500 text-navy-900 hover:bg-saffron-600 shadow-sm',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent';
type Size = 'sm' | 'md' | 'lg';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; size?: Size; busy?: boolean;
}>(function Button({ variant = 'primary', size = 'md', busy, className, children, disabled, ...rest }, ref) {
  return (
    <button ref={ref} className={cx(BUTTON.base, BUTTON[variant], BUTTON[size], className)} disabled={disabled || busy} {...rest}>
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({ variant = 'primary', size = 'md', className, ...rest }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={cx(BUTTON.base, BUTTON[variant], BUTTON[size], className)} {...rest} />;
}

export function Card({ className, ...rest }: ComponentProps<'div'>) {
  return <div className={cx('card', className)} {...rest} />;
}

const TONES = {
  slate: 'bg-slate-100 text-slate-700 ring-slate-200',
  brand: 'bg-brand-50 text-brand-700 ring-brand-200',
  saffron: 'bg-saffron-50 text-saffron-700 ring-saffron-100',
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  blue: 'bg-sky-50 text-sky-700 ring-sky-200',
  violet: 'bg-violet-50 text-violet-700 ring-violet-200',
  amber: 'bg-amber-50 text-amber-800 ring-amber-200',
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset', TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Marks seed content so nobody mistakes it for real campus information. */
export function SampleBadge({ show = true }: { show?: boolean }) {
  if (!show) return null;
  return <Badge tone="amber" title="Sample content from the development seed - replace it from the admin dashboard">Sample data</Badge>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('skeleton', className ?? 'h-4 w-full')} aria-hidden />;
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card space-y-3 p-5" role="status" aria-label="Loading">
      <Skeleton className="h-5 w-2/3" />
      {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className={cx('h-3.5', i % 2 ? 'w-5/6' : 'w-full')} />)}
    </div>
  );
}

export function ListSkeleton({ count = 3, rows = 2 }: { count?: number; rows?: number }) {
  return <div className="space-y-3">{Array.from({ length: count }, (_, i) => <CardSkeleton key={i} rows={rows} />)}</div>;
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div className="mb-3 rounded-full bg-slate-100 p-3 text-slate-500">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-slate-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && <button onClick={onRetry} className="mt-2 font-medium underline underline-offset-2">Try again</button>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'green'; children: ReactNode }) {
  const c = { blue: 'border-sky-200 bg-sky-50 text-sky-900', amber: 'border-amber-200 bg-amber-50 text-amber-900', green: 'border-emerald-200 bg-emerald-50 text-emerald-900' }[tone];
  return <div className={cx('rounded-xl border p-4 text-sm', c)}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor, required }: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-800">
        {label}{required && <span className="text-red-600"> *</span>}
      </label>
      {children}
      {error ? <p className="text-xs text-red-700" role="alert">{error}</p> : hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-slate-500" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-brand-700">{eyebrow}</div>}
        <h1 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-600 sm:text-base">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl p-0 shadow-xl backdrop:bg-navy-900/50', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div>
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
            <button onClick={onClose} className="rounded-lg p-1 text-slate-500 hover:bg-slate-100" aria-label="Close"><X className="h-5 w-5" /></button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="mb-5 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
            value === t.value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
