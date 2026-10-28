import { useCurrentFrame } from 'remotion';
import { Canvas, Glove, INK, MINT, PAPER, Shoe, SUN, TANGERINE, BUBBLEGUM, bump, eyes, LOOP, wave } from './parts';

/**
 * Mithra, the kiosk buddy: bobs, waves hello, blinks, swings its tassel and
 * "speaks" twice per loop (mouth moves, sound arcs ripple out).
 */
export function Mithra() {
  const f = useCurrentFrame();
  const bob = wave(f, 2, 3);
  const envelope = 0.5 - 0.5 * Math.cos((2 * Math.PI * f) / LOOP);          // 0 at the loop edges
  const armAngle = -envelope * 28 + wave(f, 8, 16) * envelope;                // waves mid-loop
  const open = eyes(f);
  const talk = Math.max(bump(f, 20, 12), bump(f, 80, 12)) * (0.55 + 0.45 * Math.abs(Math.sin(f * 0.9)));
  const tassel = wave(f, 2, 9, 0.6);
  const ripple = (at: number) => Math.max(bump(f, at, 7), bump(f, at + 60, 7));

  return (
    <Canvas label="Mithra, the campus kiosk buddy, waving">
      {/* shadow stays on the ground while the body bobs */}
      <ellipse cx="120" cy="228" rx={44 - bob} ry="5" fill={INK} opacity="0.15" />
      <g transform={`translate(0 ${bob})`}>
        {/* legs */}
        <path d="M100 196v24M140 196v24" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <Shoe x={96} y={224 - bob} flip />
        <Shoe x={144} y={224 - bob} />
        {/* left arm on the hip-ish, right arm waving */}
        <path d="M70 160c-22 0-34-16-30-36" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <Glove x={40} y={118} flip />
        <g transform={`rotate(${armAngle} 170 160)`}>
          <path d="M170 160c26-2 36-24 30-48" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
          <Glove x={200} y={104} rotate={wave(f, 8, 10) * envelope} />
        </g>
        {/* body */}
        <rect x="78" y="150" width="84" height="54" rx="20" fill={MINT} stroke={INK} strokeWidth="4.5" />
        <text x="120" y="188" textAnchor="middle" fontFamily="Bricolage Grotesque, Arial Black, sans-serif" fontWeight="800" fontSize="26" fill={INK}>M</text>
        {/* head */}
        <rect x="46" y="64" width="148" height="96" rx="34" fill={SUN} stroke={INK} strokeWidth="4.5" />
        <rect x="60" y="76" width="120" height="72" rx="24" fill={INK} />
        <ellipse cx="96" cy="108" rx="13" ry={15 * open} fill={PAPER} />
        <ellipse cx="144" cy="108" rx="13" ry={15 * open} fill={PAPER} />
        {open > 0.35 && (
          <>
            <circle cx={99 + wave(f, 1, 1.5)} cy="111" r="6" fill={INK} />
            <circle cx={147 + wave(f, 1, 1.5)} cy="111" r="6" fill={INK} />
            <circle cx={101 + wave(f, 1, 1.5)} cy="108" r="2" fill={PAPER} />
            <circle cx={149 + wave(f, 1, 1.5)} cy="108" r="2" fill={PAPER} />
          </>
        )}
        {talk > 0.08 ? (
          <ellipse cx="120" cy="132" rx={11 - talk * 2} ry={2 + talk * 7} fill={TANGERINE} stroke={PAPER} strokeWidth="3" />
        ) : (
          <path d="M104 130c8 9 24 9 32 0" fill="none" stroke={PAPER} strokeWidth="4.5" strokeLinecap="round" />
        )}
        <circle cx="76" cy="128" r="6" fill={BUBBLEGUM} opacity={0.7 + 0.3 * envelope} />
        <circle cx="164" cy="128" r="6" fill={BUBBLEGUM} opacity={0.7 + 0.3 * envelope} />
        {/* graduation cap, tassel swinging */}
        <path d="M120 22l66 22-66 22-66-22z" fill={INK} />
        <path d="M84 52v14c20 10 52 10 72 0V52" fill={INK} />
        <g transform={`rotate(${tassel} 172 54)`}>
          <path d="M120 44l52 10v26" fill="none" stroke={TANGERINE} strokeWidth="4" strokeLinecap="round" />
          <rect x="166" y="76" width="12" height="16" rx="4" fill={TANGERINE} stroke={INK} strokeWidth="3" />
        </g>
        {/* speech ripples */}
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M${26 - i * 9} ${90 - i * 9}q${-8 - i * 2} ${18 + i * 9} 0 ${36 + i * 18}`} fill="none" stroke={INK}
            strokeWidth="4" strokeLinecap="round" opacity={ripple(14 + i * 6)} />
        ))}
      </g>
    </Canvas>
  );
}
