// Flat cartoon illustrations in the poster style: ink outlines, flat fills,
// rubber-hose arms with white gloves. Decorative only (aria-hidden).

const INK = '#1d1a16';
const PAPER = '#f7f0e3';

function Glove({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-11 -2c0-8 7-12 13-10 4-6 12-4 12 2 5 0 7 6 4 10 3 4 0 10-6 9-3 5-12 6-17 1-6-1-8-7-6-12z" fill={PAPER} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M2 -12c1 4 1 7-1 10M14 -8c-1 3-3 5-6 6" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function Shoe({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-6 -4h12c10 0 18 5 18 11H-10c-2-5 0-11 4-11z" fill={INK} />
      <path d="M2 -1c4 0 8 1 11 3" stroke={PAPER} strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** Mithra, the kiosk buddy: a saffron robot head in a graduation cap. */
export function MithraBuddy({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      {/* legs */}
      <path d="M100 196v24M140 196v24" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <Shoe x={96} y={224} flip />
      <Shoe x={144} y={224} />
      {/* arms */}
      <path d="M70 160c-22 0-34-16-30-36" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M170 160c26-2 36-24 30-48" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <Glove x={40} y={118} flip />
      <Glove x={200} y={104} />
      {/* body */}
      <rect x="78" y="150" width="84" height="54" rx="20" fill="#56b49c" stroke={INK} strokeWidth="4.5" />
      <text x="120" y="188" textAnchor="middle" fontFamily="var(--font-display)" fontWeight="800" fontSize="26" fill={INK}>M</text>
      {/* head */}
      <rect x="46" y="64" width="148" height="96" rx="34" fill="#f1bd3b" stroke={INK} strokeWidth="4.5" />
      <rect x="60" y="76" width="120" height="72" rx="24" fill={INK} />
      <ellipse cx="96" cy="108" rx="13" ry="15" fill={PAPER} />
      <ellipse cx="144" cy="108" rx="13" ry="15" fill={PAPER} />
      <circle cx="99" cy="111" r="6" fill={INK} />
      <circle cx="147" cy="111" r="6" fill={INK} />
      <circle cx="101" cy="108" r="2" fill={PAPER} />
      <circle cx="149" cy="108" r="2" fill={PAPER} />
      <path d="M104 130c8 9 24 9 32 0" fill="none" stroke={PAPER} strokeWidth="4.5" strokeLinecap="round" />
      <circle cx="76" cy="128" r="6" fill="#ea8cc1" />
      <circle cx="164" cy="128" r="6" fill="#ea8cc1" />
      {/* graduation cap */}
      <path d="M120 22l66 22-66 22-66-22z" fill={INK} />
      <path d="M84 52v14c20 10 52 10 72 0V52" fill={INK} />
      <path d="M120 44l52 10v26" fill="none" stroke="#ee7a22" strokeWidth="4" strokeLinecap="round" />
      <rect x="166" y="76" width="12" height="16" rx="4" fill="#ee7a22" stroke={INK} strokeWidth="3" />
    </svg>
  );
}

/** A cheerful phone holding up a QR code. */
export function PhoneWithQr({ className }: { className?: string }) {
  const cells = [
    [0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2],
    [4, 0], [4, 2], [3, 3], [5, 3], [4, 4], [0, 4], [2, 4], [1, 5], [3, 5], [5, 5], [4, 1],
  ];
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      <path d="M104 196v22M136 196v22" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <Shoe x={100} y={222} flip />
      <Shoe x={140} y={222} />
      <path d="M78 130c-20 4-30 20-26 38" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      <path d="M162 120c18-10 26-30 22-52" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
      {/* phone */}
      <rect x="74" y="34" width="92" height="166" rx="24" fill="#7d8dd6" stroke={INK} strokeWidth="4.5" />
      <rect x="86" y="54" width="68" height="112" rx="12" fill={PAPER} stroke={INK} strokeWidth="3.5" />
      <circle cx="120" cy="44" r="4" fill={INK} />
      <rect x="108" y="176" width="24" height="10" rx="5" fill={PAPER} stroke={INK} strokeWidth="3" />
      <ellipse cx="106" cy="98" rx="8" ry="10" fill={INK} />
      <ellipse cx="134" cy="98" rx="8" ry="10" fill={INK} />
      <circle cx="108" cy="95" r="2.5" fill={PAPER} />
      <circle cx="136" cy="95" r="2.5" fill={PAPER} />
      <path d="M104 120c6 12 26 12 32 0z" fill="#ee7a22" stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <circle cx="96" cy="114" r="5" fill="#ea8cc1" />
      <circle cx="144" cy="114" r="5" fill="#ea8cc1" />
      {/* QR card */}
      <g transform="rotate(10 196 52)">
        <rect x="160" y="16" width="72" height="72" rx="10" fill={PAPER} stroke={INK} strokeWidth="4" />
        {cells.map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={170 + cx * 9} y={26 + cy * 9} width="8" height="8" fill={INK} />)}
      </g>
      <Glove x={184} y={74} />
      <Glove x={52} y={170} flip />
    </svg>
  );
}

/** A folded campus map with a dotted walking route and a pin. */
export function MapRoute({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 240" className={className} aria-hidden>
      <path d="M24 54l60-20 72 20 60-20v152l-60 20-72-20-60 20z" fill={PAPER} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M84 34v152M156 54v152" stroke={INK} strokeWidth="3" />
      <path d="M24 54l60-20v152l-60 20z" fill="#bfe3d5" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <path d="M156 54l60-20v152l-60 20z" fill="#f8dc94" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
      <rect x="100" y="70" width="40" height="28" rx="6" fill="#7d8dd6" stroke={INK} strokeWidth="3.5" />
      <rect x="40" y="116" width="30" height="40" rx="6" fill="#ea8cc1" stroke={INK} strokeWidth="3.5" />
      <rect x="170" y="124" width="32" height="26" rx="6" fill="#ee7a22" stroke={INK} strokeWidth="3.5" />
      <path d="M54 172c10-30 40-20 56-40s28-34 52-30 28 22 30 26" fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
      <path d="M192 76c-14 0-24 10-24 23 0 17 24 37 24 37s24-20 24-37c0-13-10-23-24-23z" fill="#d9472b" stroke={INK} strokeWidth="4.5" />
      <circle cx="192" cy="99" r="8" fill={PAPER} stroke={INK} strokeWidth="3" />
      <circle cx="54" cy="174" r="9" fill="#f1bd3b" stroke={INK} strokeWidth="3.5" />
    </svg>
  );
}
