/** Round mark: the campus roof (saffron) over a doorway (mint), on ink. */
export function LogoMark({ className = 'h-10 w-10' }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={className} aria-hidden>
      <circle cx="20" cy="20" r="19" fill="#1d1a16" />
      <circle cx="20" cy="20" r="16.2" fill="none" stroke="#f3eada" strokeWidth="1.4" />
      <path d="M10.5 26.5V16.2L20 11l9.5 5.2v10.3" fill="none" stroke="#f1bd3b" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <path d="M15.5 26.5v-6h9v6" fill="none" stroke="#56b49c" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="20" cy="16" r="1.9" fill="#ee7a22" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="display text-[1.35rem] leading-none sm:text-2xl">Mithra</span>
    </span>
  );
}
