import { getLength, getPointAtLength } from '@remotion/paths';
import { useId } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BUBBLEGUM, Canvas, INK, MINT, PAPER, PERIWINKLE, Sparkle, SUN, TANGERINE, TOMATO, wave } from './parts';

const ROUTE = 'M54 172c10-30 40-20 56-40s28-34 52-30 28 22 30 26';
const LENGTH = getLength(ROUTE);
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * The campus map: the route draws itself while a walker follows it, the pin
 * drops on the destination with a bounce, then everything fades to restart.
 */
export function MapWalk() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const walked = interpolate(f, [8, 68], [0, 1], clamp);
  const walker = getPointAtLength(ROUTE, LENGTH * walked);
  const drop = spring({ frame: f - 62, fps, config: { damping: 9, stiffness: 140 } });
  const pinY = interpolate(drop, [0, 1], [-70, 0]);
  const fadeOut = interpolate(f, [104, 118], [1, 0], clamp);   // reset before the loop restarts
  const float = wave(f, 1, 2.5);
  const maskId = `route-${useId().replace(/:/g, '')}`;

  return (
    <Canvas label="A campus map with a walking route being drawn to a destination pin">
      <g transform={`translate(0 ${float})`}>
        <path d="M24 54l60-20 72 20 60-20v152l-60 20-72-20-60 20z" fill={PAPER} stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M84 34v152M156 54v152" stroke={INK} strokeWidth="3" />
        <path d="M24 54l60-20v152l-60 20z" fill="#bfe3d5" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
        <path d="M156 54l60-20v152l-60 20z" fill="#f8dc94" stroke={INK} strokeWidth="4.5" strokeLinejoin="round" />
        <rect x="100" y="70" width="40" height="28" rx="6" fill={PERIWINKLE} stroke={INK} strokeWidth="3.5" />
        <rect x="40" y="116" width="30" height="40" rx="6" fill={BUBBLEGUM} stroke={INK} strokeWidth="3.5" />
        <rect x="170" y="124" width="32" height="26" rx="6" fill={TANGERINE} stroke={INK} strokeWidth="3.5" />

        <g opacity={fadeOut}>
          {/* the dotted route, revealed as the walker goes */}
          <defs>
            <mask id={maskId}>
              <path d={ROUTE} fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round"
                strokeDasharray={LENGTH} strokeDashoffset={LENGTH * (1 - walked)} />
            </mask>
          </defs>
          <path d={ROUTE} fill="none" stroke={INK} strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" mask={`url(#${maskId})`} />
          {/* start */}
          <circle cx="54" cy="174" r="9" fill={SUN} stroke={INK} strokeWidth="3.5" />
          {/* walker */}
          {walker && walked > 0 && walked < 1 && (
            <g transform={`translate(${walker.x} ${walker.y - 6 - Math.abs(Math.sin(f * 0.6)) * 4})`}>
              <circle r="8" fill={MINT} stroke={INK} strokeWidth="3" />
              <circle cx="-2.5" cy="-1.5" r="1.4" fill={INK} />
              <circle cx="2.5" cy="-1.5" r="1.4" fill={INK} />
            </g>
          )}
          {/* destination pin drops in */}
          {f >= 62 && (
            <g transform={`translate(0 ${pinY})`}>
              <path d="M192 76c-14 0-24 10-24 23 0 17 24 37 24 37s24-20 24-37c0-13-10-23-24-23z" fill={TOMATO} stroke={INK} strokeWidth="4.5" />
              <circle cx="192" cy="99" r="8" fill={PAPER} stroke={INK} strokeWidth="3" />
            </g>
          )}
          <Sparkle x={222} y={70} frame={f} at={80} size={9} />
          <Sparkle x={164} y={74} frame={f} at={86} size={7} color={MINT} />
        </g>
      </g>
    </Canvas>
  );
}
