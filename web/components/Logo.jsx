/**
 * Campus Mithra mark: a graduation cap over a speech arc.
 * "Mithra" means friend, so the cap sits inside a rounded, friendly badge and
 * the two arcs on the right are the assistant talking back.
 */
export default function Logo({ size = 44, id = 'cm' }) {
  const gid = `${id}-grad`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label="Campus Mithra"
      style={{ display: 'block', flex: '0 0 auto' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f6a623" />
          <stop offset="0.55" stopColor="#f08a24" />
          <stop offset="1" stopColor="#0f9b8e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill={`url(#${gid})`} />
      <path d="M32 14 54 25 32 36 10 25Z" fill="#fff" />
      <path
        d="M19 31v9c0 3.4 6.2 6.5 13 6.5S45 43.4 45 40v-9L32 37Z"
        fill="#fff"
        opacity=".9"
      />
      <path d="M54 25v13" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="54" cy="41" r="2.7" fill="#fff" />
      <path
        d="M49 50q5 3 9 0M51 55q4 2.5 7 0"
        stroke="#fff"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity=".75"
      />
    </svg>
  );
}

export function Wordmark({ size = 44, sub = 'your campus companion' }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <Logo size={size} />
      <span style={{ lineHeight: 1.15 }}>
        <b
          style={{
            display: 'block',
            fontFamily: 'var(--serif)',
            fontSize: '1.42rem',
            fontWeight: 700,
            letterSpacing: '-.01em',
          }}
        >
          Campus Mithra
        </b>
        {sub ? (
          <small style={{ fontSize: '.78rem', color: 'var(--ink-mute)', letterSpacing: '.03em' }}>
            {sub}
          </small>
        ) : null}
      </span>
    </span>
  );
}
