'use client';

import Link from 'next/link';
import { forwardRef, useEffect, useRef, type ButtonHTMLAttributes, type ComponentProps, type ReactNode } from 'react';
import { AlertTriangle, ArrowUpRight, Inbox, Loader2, X } from 'lucide-react';

export function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(' ');
}

// Pill buttons with an ink outline, as on the poster. Labels are set in caps
// by CSS only, so accessible names keep their normal case.
const BUTTON = {
  base: 'inline-flex items-center justify-center gap-2 rounded-full font-extrabold uppercase tracking-[0.06em] transition-[transform,background-color,box-shadow] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-55',
  primary: 'border-2 border-ink bg-sun text-ink hover:bg-[#f5c95a] hover:shadow-[0_3px_0_0_var(--color-ink)]',
  secondary: 'border-2 border-ink bg-transparent text-ink hover:bg-ink/5',
  ghost: 'text-ink hover:bg-ink/5',
  danger: 'border-2 border-ink bg-tomato text-paper hover:brightness-95',
  accent: 'border-2 border-ink bg-tangerine text-ink hover:brightness-105 hover:shadow-[0_3px_0_0_var(--color-ink)]',
  dark: 'border-2 border-ink bg-ink text-paper hover:bg-slate-800',
  sm: 'px-3.5 py-1.5 text-[11px]',
  md: 'px-5 py-2.5 text-xs',
  lg: 'px-7 py-4 text-sm sm:text-base',
};
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'dark';
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
  slate: 'bg-paper text-ink',
  brand: 'bg-mint text-ink',
  saffron: 'bg-tangerine text-ink',
  green: 'bg-[#9fd9a8] text-ink',
  red: 'bg-tomato text-paper',
  blue: 'bg-periwinkle text-ink',
  violet: 'bg-bubblegum text-ink',
  amber: 'bg-sun text-ink',
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = 'slate', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-full border-[1.5px] border-ink px-2.5 py-0.5 text-[11px] font-extrabold uppercase tracking-[0.05em]', TONES[tone], className)}>
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
    <div className="halftone flex flex-col items-center rounded-[var(--radius-blob)] border-2 border-dashed border-ink/50 px-6 py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full border-2 border-ink bg-sun text-ink">{icon ?? <Inbox className="h-6 w-6" aria-hidden />}</div>
      <h3 className="display text-2xl">{title}</h3>
      {body && <p className="mt-2 max-w-md text-sm text-slate-700">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-ink bg-[#f6c3b4] p-4 text-sm font-medium text-ink">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="flex-1">
        <p>{message}</p>
        {onRetry && <button onClick={onRetry} className="mt-2 font-extrabold uppercase tracking-wide underline decoration-2 underline-offset-4">Try again</button>}
      </div>
    </div>
  );
}

export function Notice({ tone = 'blue', children }: { tone?: 'blue' | 'amber' | 'green'; children: ReactNode }) {
  const c = { blue: 'bg-[#c9d1f0]', amber: 'bg-[#f8dc94]', green: 'bg-[#bfe3d5]' }[tone];
  return <div className={cx('rounded-2xl border-2 border-ink p-4 text-sm text-ink', c)}>{children}</div>;
}

export function Field({ label, hint, error, children, htmlFor, required }: {
  label: string; hint?: ReactNode; error?: string | null; children: ReactNode; htmlFor?: string; required?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block pl-1 text-sm font-bold text-ink">
        {label}{required && <span className="text-tomato"> *</span>}
      </label>
      {children}
      {error ? <p className="pl-1 text-xs font-semibold text-tomato" role="alert">{error}</p> : hint ? <p className="pl-1 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm font-semibold text-slate-600" role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> {label}
    </div>
  );
}

/** A poster headline that ends with a full stop: "Campus map" -> CAMPUS MAP. */
export function poster(title: string) {
  return /[.!?]$/.test(title.trim()) ? title : `${title}.`;
}

export function PageHeader({ title, subtitle, actions, eyebrow }: { title: string; subtitle?: ReactNode; actions?: ReactNode; eyebrow?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-3 inline-flex rounded-full border-2 border-ink bg-sun px-3 py-1 label-caps">{eyebrow}</div>}
        <h1 className="display break-words text-[2.75rem] sm:text-6xl lg:text-7xl">{poster(title)}</h1>
        {subtitle && <p className="mt-3 max-w-2xl text-base text-slate-700 sm:text-lg">{subtitle}</p>}
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
      className={cx('m-auto w-[calc(100%-2rem)] rounded-[var(--radius-blob)] border-2 border-ink bg-paper p-0 text-ink backdrop:bg-ink/60', wide ? 'max-w-3xl' : 'max-w-lg')}>
      {open && (
        <div>
          <div className="flex items-center justify-between border-b-2 border-ink px-5 py-4">
            <h2 className="display text-2xl">{title}</h2>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-tangerine" aria-label="Close"><X className="h-4 w-4" /></button>
          </div>
          <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode }[] }) {
  return (
    <div className="mb-6 flex w-full gap-1 overflow-x-auto rounded-full border-2 border-ink bg-white p-1 sm:w-fit" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cx('whitespace-nowrap rounded-full px-4 py-2 text-xs font-extrabold uppercase tracking-[0.06em] transition-colors',
            value === t.value ? 'bg-ink text-paper' : 'text-ink hover:bg-ink/5')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

// --- poster pieces ------------------------------------------------------------

const BLOCK = {
  sun: 'bg-sun', tangerine: 'bg-tangerine', bubblegum: 'bg-bubblegum', periwinkle: 'bg-periwinkle',
  mint: 'bg-mint', paper: 'bg-white', ink: 'bg-ink text-paper',
};
export type Block = keyof typeof BLOCK;

/** A flat colour block with an ink outline (the feature tiles). */
export function ColorCard({ color = 'paper', className, ...rest }: ComponentProps<'div'> & { color?: Block }) {
  return <div className={cx('rounded-[var(--radius-blob)] border-2 border-ink', BLOCK[color], className)} {...rest} />;
}

/** Feature tile: an icon and a two-line caps label ("PLAYS ON / YOUR TV"). */
export function Tile({ href, color, icon, title, subtitle }: { href: string; color: Block; icon: ReactNode; title: string; subtitle: string }) {
  return (
    <Link href={href} className={cx('group flex min-h-36 flex-col justify-between rounded-[var(--radius-blob)] border-2 border-ink p-5 transition-transform duration-150 hover:-translate-y-0.5 hover:shadow-[0_4px_0_0_var(--color-ink)]', BLOCK[color])}>
      <span className="[&_svg]:h-9 [&_svg]:w-9 [&_svg]:stroke-[2.2]" aria-hidden>{icon}</span>
      <span className="mt-6 block leading-tight">
        <span className="block font-[family-name:var(--font-display)] text-lg font-extrabold uppercase tracking-[-0.01em]">{title}</span>
        <span className="block text-sm font-semibold uppercase tracking-[0.02em]">{subtitle}</span>
      </span>
    </Link>
  );
}

/** Spiky starburst sticker ("NEW!", "1ST PLACE!"). Decorative unless labelled. */
export function Starburst({ children, color = 'bubblegum', className, size = 112 }: { children: ReactNode; color?: Block; className?: string; size?: number }) {
  const spikes = 14;
  const points = Array.from({ length: spikes * 2 }, (_, i) => {
    const r = i % 2 ? 37 : 50;
    const a = (Math.PI * i) / spikes - Math.PI / 2;
    return `${50 + r * Math.cos(a)},${50 + r * Math.sin(a)}`;
  }).join(' ');
  const fill = { sun: '#f1bd3b', tangerine: '#ee7a22', bubblegum: '#ea8cc1', periwinkle: '#7d8dd6', mint: '#56b49c', paper: '#f7f0e3', ink: '#1d1a16' }[color];
  return (
    // className positions the sticker (e.g. "absolute -top-8 right-4"); the
    // inner box is the positioning context for the shape.
    <div className={cx('pointer-events-none', className)} style={{ width: size, height: size }}>
      <div className="relative grid h-full w-full place-items-center">
        <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
          <polygon points={points} fill={fill} stroke="#1d1a16" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
        <span className="relative -rotate-12 text-center font-[family-name:var(--font-display)] text-[15px] font-extrabold uppercase leading-[0.95] tracking-[-0.01em] text-ink">{children}</span>
      </div>
    </div>
  );
}

/** Round badge with text running around the rim ("FREE BETA · ANDROID"). */
export function RoundSticker({ top, bottom, children, className }: { top: string; bottom: string; children: ReactNode; className?: string }) {
  return (
    <div className={cx('pointer-events-none h-32 w-32 sm:h-40 sm:w-40', className)} aria-hidden>
      <div className="relative h-full w-full">
      <svg viewBox="0 0 200 200" className="absolute inset-0 h-full w-full">
        <defs>
          <path id="rim-top" d="M 30 100 A 70 70 0 0 1 170 100" />
          <path id="rim-bottom" d="M 22 100 A 78 78 0 0 0 178 100" />
        </defs>
        <circle cx="100" cy="100" r="96" fill="#56b49c" stroke="#1d1a16" strokeWidth="4" />
        <text fontFamily="var(--font-display)" fontWeight="800" fontSize="25" letterSpacing="3" fill="#1d1a16">
          <textPath href="#rim-top" startOffset="50%" textAnchor="middle">{top}</textPath>
        </text>
        <text fontFamily="var(--font-display)" fontWeight="800" fontSize="25" letterSpacing="3" fill="#1d1a16">
          <textPath href="#rim-bottom" startOffset="50%" textAnchor="middle">{bottom}</textPath>
        </text>
        <path d="M 25 100 l 6 -6 l 6 6 l -6 6 z M 163 100 l 6 -6 l 6 6 l -6 6 z" fill="#1d1a16" />
        <circle cx="100" cy="100" r="44" fill="#ea8cc1" stroke="#1d1a16" strokeWidth="4" />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
      </div>
    </div>
  );
}

/** Section heading in poster type, with an optional "See all" pill. */
export function PosterHeading({ title, href, linkLabel = 'See all', className }: { title: string; href?: string; linkLabel?: string; className?: string }) {
  return (
    <div className={cx('mb-5 flex items-end justify-between gap-3', className)}>
      <h2 className="display text-4xl sm:text-5xl">{poster(title)}</h2>
      {href && (
        <Link href={href} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border-2 border-ink px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.06em] hover:bg-ink/5">
          {linkLabel} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      )}
    </div>
  );
}
