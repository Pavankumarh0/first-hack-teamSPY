import { useCurrentFrame } from 'remotion';
import { BUBBLEGUM, Canvas, Glove, INK, PAPER, PERIWINKLE, Shoe, Sparkle, SUN, TANGERINE, eyes, wave } from './parts';

const CELLS = [
  [0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2],
  [4, 0], [4, 2], [3, 3], [5, 3], [4, 4], [0, 4], [2, 4], [1, 5], [3, 5], [5, 5], [4, 1],
];

/**
 * A cheerful phone that hops and holds up a QR code; a scan line sweeps the
 * code and sparkles pop when it "reads" it.
 */
export function PhoneQr() {
  const f = useCurrentFrame();
  const hop = -Math.abs(wave(f, 2, 9));                 // two hops per loop
  const squash = 1 + Math.max(0, 0.05 - Math.abs(hop) / 60);
  const open = eyes(f, [30, 90]);
  const qrTilt = 10 + wave(f, 2, 7, 1);
  const scanY = 26 + ((f % 60) / 60) * 54;              // sweeps the code twice per loop
  const smile = 6 + Math.abs(wave(f, 2, 4));

  return (
    <Canvas label="A phone character holding up a campus QR code">
      <ellipse cx="120" cy="228" rx={40 + hop / 2} ry="5" fill={INK} opacity="0.15" />
      <g transform={`translate(0 ${hop}) translate(120 220) scale(${1 / squash} ${squash}) translate(-120 -220)`}>
        <path d="M104 196v22M136 196v22" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <Shoe x={100} y={222} flip />
        <Shoe x={140} y={222} />
        <path d="M78 130c-20 4-30 20-26 38" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
        <g transform={`rotate(${wave(f, 2, 6)} 162 120)`}>
          <path d="M162 120c18-10 26-30 22-52" fill="none" stroke={INK} strokeWidth="9" strokeLinecap="round" />
          {/* the QR card it holds up */}
          <g transform={`rotate(${qrTilt} 196 52)`}>
            <rect x="160" y="16" width="72" height="72" rx="10" fill={PAPER} stroke={INK} strokeWidth="4" />
            {CELLS.map(([cx, cy]) => <rect key={`${cx}-${cy}`} x={170 + cx * 9} y={26 + cy * 9} width="8" height="8" fill={INK} />)}
            <rect x="164" y={scanY} width="64" height="4" rx="2" fill={TANGERINE} opacity="0.9" />
          </g>
          <Glove x={184} y={74} />
        </g>
        {/* phone body */}
        <rect x="74" y="34" width="92" height="166" rx="24" fill={PERIWINKLE} stroke={INK} strokeWidth="4.5" />
        <rect x="86" y="54" width="68" height="112" rx="12" fill={PAPER} stroke={INK} strokeWidth="3.5" />
        <circle cx="120" cy="44" r="4" fill={INK} />
        <rect x="108" y="176" width="24" height="10" rx="5" fill={PAPER} stroke={INK} strokeWidth="3" />
        <ellipse cx="106" cy="98" rx="8" ry={10 * open} fill={INK} />
        <ellipse cx="134" cy="98" rx="8" ry={10 * open} fill={INK} />
        {open > 0.4 && (
          <>
            <circle cx="108" cy="95" r="2.5" fill={PAPER} />
            <circle cx="136" cy="95" r="2.5" fill={PAPER} />
          </>
        )}
        <path d={`M104 120c6 ${smile} 26 ${smile} 32 0z`} fill={TANGERINE} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
        <circle cx="96" cy="114" r="5" fill={BUBBLEGUM} />
        <circle cx="144" cy="114" r="5" fill={BUBBLEGUM} />
        <Glove x={52} y={170} flip />
      </g>
      <Sparkle x={150} y={14} frame={f} at={52} size={9} />
      <Sparkle x={228} y={98} frame={f} at={56} size={7} color={SUN} />
      <Sparkle x={150} y={14} frame={f} at={112} size={9} />
      <Sparkle x={228} y={98} frame={f} at={116} size={7} color={SUN} />
    </Canvas>
  );
}
