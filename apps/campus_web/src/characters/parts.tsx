// Shared drawing parts and timing helpers for the animated characters.
// Plain SVG and the `remotion` package only (no app imports), so the same files
// run in the website's <Player> and in `remotion render` for the app's assets.
import { interpolate } from 'remotion';

export const INK = '#1d1a16';
export const PAPER = '#f7f0e3';
export const SUN = '#f1bd3b';
export const TANGERINE = '#ee7a22';
export const BUBBLEGUM = '#ea8cc1';
export const PERIWINKLE = '#7d8dd6';
export const MINT = '#56b49c';
export const TOMATO = '#d9472b';

/** Every character loops seamlessly over this many frames (4 s at 30 fps). */
export const LOOP = 120;
export const FPS = 30;

/** sin wave that completes `cycles` whole periods per loop, so it loops cleanly. */
export function wave(frame: number, cycles: number, amplitude: number, phase = 0) {
  return Math.sin((2 * Math.PI * cycles * frame) / LOOP + phase) * amplitude;
}

/** 0 -> 1 -> 0 around `at` (a blink, a pop). */
export function bump(frame: number, at: number, half: number) {
  return interpolate(frame, [at - half, at, at + half], [0, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
}

/** Eye openness 1..0.08 with two blinks per loop. */
export function eyes(frame: number, blinks: number[] = [44, 98]) {
  return Math.max(0.08, 1 - Math.max(...blinks.map((b) => bump(frame, b, 3))));
}

export function Glove({ x, y, flip = false, rotate = 0 }: { x: number; y: number; flip?: boolean; rotate?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-11 -2c0-8 7-12 13-10 4-6 12-4 12 2 5 0 7 6 4 10 3 4 0 10-6 9-3 5-12 6-17 1-6-1-8-7-6-12z" fill={PAPER} stroke={INK} strokeWidth="3.5" strokeLinejoin="round" />
      <path d="M2 -12c1 4 1 7-1 10M14 -8c-1 3-3 5-6 6" fill="none" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

export function Shoe({ x, y, flip = false }: { x: number; y: number; flip?: boolean }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${flip ? -1 : 1} 1)`}>
      <path d="M-6 -4h12c10 0 18 5 18 11H-10c-2-5 0-11 4-11z" fill={INK} />
      <path d="M2 -1c4 0 8 1 11 3" stroke={PAPER} strokeWidth="2" strokeLinecap="round" fill="none" />
    </g>
  );
}

/** A four-point sparkle that pops in and out around frame `at`. */
export function Sparkle({ x, y, frame, at, size = 10, color = SUN }: { x: number; y: number; frame: number; at: number; size?: number; color?: string }) {
  const s = bump(frame, at, 8);
  if (s <= 0) return null;
  return (
    <g transform={`translate(${x} ${y}) scale(${s}) rotate(${s * 45})`}>
      <path d={`M0 ${-size}C${size * 0.15} ${-size * 0.15} ${size * 0.15} ${-size * 0.15} ${size} 0C${size * 0.15} ${size * 0.15} ${size * 0.15} ${size * 0.15} 0 ${size}C${-size * 0.15} ${size * 0.15} ${-size * 0.15} ${size * 0.15} ${-size} 0C${-size * 0.15} ${-size * 0.15} ${-size * 0.15} ${-size * 0.15} 0 ${-size}z`}
        fill={color} stroke={INK} strokeWidth="2" strokeLinejoin="round" />
    </g>
  );
}

/** Full-size SVG canvas. The characters are drawn on a 240 x 240 grid; the
    view adds a margin so hops, waves and the raised QR card are never clipped
    in a render. */
export function Canvas({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <svg viewBox="-14 -20 268 268" width="100%" height="100%" role="img" aria-label={label} style={{ overflow: 'visible' }}>
      {children}
    </svg>
  );
}
