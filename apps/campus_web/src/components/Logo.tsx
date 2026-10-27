export function LogoMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <rect width="40" height="40" rx="10" fill="#0b1020" />
      <path d="M8 27V14l12-6 12 6v13" fill="none" stroke="#f08a24" strokeWidth="3" strokeLinejoin="round" />
      <path d="M14 27v-8h12v8" fill="none" stroke="#0f9b8e" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="20" cy="14.5" r="2.2" fill="#f08a24" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <LogoMark />
      <span className="leading-tight">
        <span className="block font-[family-name:var(--font-display)] text-[15px] font-bold text-slate-900">Campus Mithra</span>
        <span className="block text-[11px] text-slate-500">Your campus, one place</span>
      </span>
    </span>
  );
}
